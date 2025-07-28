const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const queueService = require('../services/queue');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/jpg',
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

// Rate limiting middleware
const rateLimitCache = new Map();

const rateLimitMiddleware = (req, res, next) => {
  const userId = req.user.userId;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxUploads = 5;

  if (!rateLimitCache.has(userId)) {
    rateLimitCache.set(userId, []);
  }

  const userUploads = rateLimitCache.get(userId);
  
  // Remove old uploads outside the window
  const recentUploads = userUploads.filter(timestamp => now - timestamp < windowMs);
  rateLimitCache.set(userId, recentUploads);

  if (recentUploads.length >= maxUploads) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Maximum ${maxUploads} uploads per hour allowed`
    });
  }

  // Add current upload timestamp
  recentUploads.push(now);
  next();
};

// Upload files endpoint
router.post('/', rateLimitMiddleware, upload.array('files', 5), async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];

    for (const file of files) {
      try {
        // Read file data
        const fileData = await fs.readFile(file.path);

        // Save upload record to database
        const uploadResult = await req.db.query(`
          INSERT INTO uploads (user_id, filename, file_type, file_size, upload_type, storage_path)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [
          userId,
          file.originalname,
          file.mimetype,
          file.size,
          'manual',
          file.path
        ]);

        const uploadId = uploadResult.rows[0].id;

        // Queue processing job (will process directly if Redis not available)
        const processingResult = await queueService.addJob('process-upload', {
          userId,
          uploadId,
          fileName: file.originalname,
          fileData: fileData.toString('base64'),
          uploadType: 'manual'
        });

        const status = processingResult && processingResult.success ? 'processed' : 'queued';
        
        results.push({
          id: uploadId,
          filename: file.originalname,
          status: status,
          processing_result: processingResult
        });

        // Clean up temporary file
        await fs.unlink(file.path).catch(console.error);

      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        results.push({
          filename: file.originalname,
          status: 'error',
          error: fileError.message
        });
      }
    }

    res.json({
      success: true,
      uploads: results,
      message: `${results.length} file(s) uploaded and queued for processing`
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up any uploaded files
    if (req.files) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(console.error);
      }
    }

    res.status(500).json({ 
      error: 'Upload failed',
      message: error.message 
    });
  }
});

// Get upload history
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await req.db.query(`
      SELECT id, filename, file_type, file_size, upload_type, processing_status, 
             processing_error, created_at, processed_at
      FROM uploads
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    // Get total count
    const countResult = await req.db.query(
      'SELECT COUNT(*) FROM uploads WHERE user_id = $1',
      [userId]
    );

    res.json({
      uploads: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });

  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch uploads',
      message: error.message 
    });
  }
});

// Get upload details
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const uploadId = req.params.id;

    const result = await req.db.query(`
      SELECT u.*, 
             COUNT(m.id) as metrics_count
      FROM uploads u
      LEFT JOIN metrics m ON u.id = m.upload_id
      WHERE u.id = $1 AND u.user_id = $2
      GROUP BY u.id
    `, [uploadId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Get associated metrics
    const metricsResult = await req.db.query(`
      SELECT m.*, hs.name as system_name
      FROM metrics m
      JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.upload_id = $1
      ORDER BY m.system_id, m.metric_name
    `, [uploadId]);

    const upload = result.rows[0];
    upload.metrics = metricsResult.rows;

    res.json({ upload });

  } catch (error) {
    console.error('Get upload details error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch upload details',
      message: error.message 
    });
  }
});

// Retry failed upload processing
router.post('/:id/retry', async (req, res) => {
  try {
    const userId = req.user.userId;
    const uploadId = req.params.id;

    // Get upload details
    const result = await req.db.query(`
      SELECT * FROM uploads 
      WHERE id = $1 AND user_id = $2 AND processing_status = 'failed'
    `, [uploadId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Upload not found or not in failed state' 
      });
    }

    const upload = result.rows[0];

    // Read file data if still available
    let fileData;
    try {
      const fs = require('fs').promises;
      const rawData = await fs.readFile(upload.storage_path);
      fileData = rawData.toString('base64');
    } catch (fileError) {
      return res.status(400).json({
        error: 'File no longer available for retry',
        message: 'Please re-upload the file'
      });
    }

    // Reset status and queue for processing
    await req.db.query(`
      UPDATE uploads 
      SET processing_status = 'pending', processing_error = NULL
      WHERE id = $1
    `, [uploadId]);

    await queueService.addJob('process-upload', {
      userId,
      uploadId,
      fileName: upload.filename,
      fileData,
      uploadType: upload.upload_type
    });

    res.json({
      success: true,
      message: 'Upload queued for retry'
    });

  } catch (error) {
    console.error('Retry upload error:', error);
    res.status(500).json({ 
      error: 'Failed to retry upload',
      message: error.message 
    });
  }
});

// Delete upload
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const uploadId = req.params.id;

    // Get upload to check ownership and get file path
    const result = await req.db.query(`
      SELECT storage_path FROM uploads 
      WHERE id = $1 AND user_id = $2
    `, [uploadId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const upload = result.rows[0];

    // Delete from database (cascading delete will remove associated metrics)
    await req.db.query('DELETE FROM uploads WHERE id = $1', [uploadId]);

    // Clean up file if it exists
    if (upload.storage_path) {
      await fs.unlink(upload.storage_path).catch(console.error);
    }

    res.json({
      success: true,
      message: 'Upload deleted successfully'
    });

  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ 
      error: 'Failed to delete upload',
      message: error.message 
    });
  }
});

module.exports = router;
