const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const openaiService = require('../services/openaiService');
const visionService = require('../services/visionService');
const metricsCatalog = require('../shared/metricsCatalog');

/**
 * Upload Controller
 * Handles file uploads and processing of lab results
 */

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, and documents are allowed'));
    }
  }
}).single('file');

/**
 * Upload file endpoint
 */
async function uploadFile(req, res) {
  upload(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        error: 'File upload error',
        message: err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    try {
      const userId = req.user.id;
      const file = req.file;

      console.log(`[Upload] User ${userId} uploaded: ${file.originalname}`);

      // Create upload record
      const uploadResult = await req.db.query(`
        INSERT INTO uploads (
          user_id,
          filename,
          file_type,
          file_size,
          upload_type,
          storage_path,
          processing_status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *
      `, [
        userId,
        file.originalname,
        file.mimetype,
        file.size,
        'manual',
        file.path
      ]);

      const upload = uploadResult.rows[0];

      // Start async processing
      processUploadAsync(req.db, userId, upload, file)
        .catch(error => {
          console.error('[Upload Processing Error]', error);
        });

      res.json({
        success: true,
        data: upload,
        message: 'File uploaded successfully and queued for processing'
      });

    } catch (error) {
      console.error('Upload file error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload file',
        message: error.message
      });
    }
  });
}

/**
 * Process upload asynchronously
 */
async function processUploadAsync(db, userId, upload, file) {
  try {
    console.log(`[Processing] Starting processing for upload ${upload.id}`);

    // Update status to processing
    await db.query(
      'UPDATE uploads SET processing_status = $1 WHERE id = $2',
      ['processing', upload.id]
    );

    let extractedData = null;

    // Extract data based on file type
    if (file.mimetype === 'application/pdf') {
      extractedData = await processPDF(file.path);
    } else if (file.mimetype.startsWith('image/')) {
      extractedData = await processImage(file.path);
    } else {
      throw new Error('Unsupported file type');
    }

    if (!extractedData || !extractedData.metrics || extractedData.metrics.length === 0) {
      throw new Error('No metrics could be extracted from the file');
    }

    console.log(`[Processing] Extracted ${extractedData.metrics.length} metrics`);

    // Match and insert metrics
    const { matched, unmatched } = await matchAndInsertMetrics(
      db,
      userId,
      upload.id,
      extractedData.metrics,
      extractedData.testDate
    );

    console.log(`[Processing] Matched: ${matched.length}, Unmatched: ${unmatched.length}`);

    // Update upload status
    await db.query(`
      UPDATE uploads 
      SET 
        processing_status = 'completed',
        processed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [upload.id]);

    // If there are unmatched metrics, they should be handled by metric suggestions controller

  } catch (error) {
    console.error(`[Processing Error] Upload ${upload.id}:`, error);

    // Update upload with error
    await db.query(`
      UPDATE uploads 
      SET 
        processing_status = 'failed',
        processing_error = $1,
        processed_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [error.message, upload.id]);
  }
}

/**
 * Process PDF file
 */
async function processPDF(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    
    const text = pdfData.text;
    console.log(`[PDF] Extracted ${text.length} characters`);

    // Use AI to extract metrics from text
    const extractedMetrics = await extractMetricsFromText(text);

    return extractedMetrics;

  } catch (error) {
    console.error('Process PDF error:', error);
    throw new Error('Failed to process PDF file');
  }
}

/**
 * Process image file using vision AI
 */
async function processImage(filePath) {
  try {
    console.log(`[Image] Processing image: ${filePath}`);

    // Read image as base64
    const imageBuffer = await fs.readFile(filePath);
    const base64Image = imageBuffer.toString('base64');

    // Use vision service to extract metrics
    const extractedMetrics = await visionService.extractMetricsFromImage(base64Image);

    return extractedMetrics;

  } catch (error) {
    console.error('Process image error:', error);
    throw new Error('Failed to process image file');
  }
}

/**
 * Extract metrics from text using AI
 */
async function extractMetricsFromText(text) {
  const prompt = `Extract all lab test metrics from the following text. 
  Return a JSON object with:
  - testDate (ISO date string)
  - metrics (array of {name, value, unit})
  
  Text:
  ${text.substring(0, 10000)}`;

  try {
    const response = await openaiService.generateCompletion(prompt);
    const parsed = JSON.parse(response);

    return {
      testDate: parsed.testDate || new Date().toISOString(),
      metrics: parsed.metrics || []
    };

  } catch (error) {
    console.error('Extract metrics from text error:', error);
    throw new Error('Failed to extract metrics from text');
  }
}

/**
 * Match and insert metrics into database
 */
async function matchAndInsertMetrics(db, userId, uploadId, metrics, testDate) {
  const matched = [];
  const unmatched = [];

  for (const metric of metrics) {
    try {
      // Try to find metric in catalog
      const catalogMetric = metricsCatalog.findMetricByName(metric.name);

      if (catalogMetric) {
        // Insert matched metric
        const result = await db.query(`
          INSERT INTO metrics (
            user_id,
            upload_id,
            system_id,
            metric_name,
            metric_value,
            metric_unit,
            test_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          userId,
          uploadId,
          catalogMetric.system_id,
          catalogMetric.metric_name,
          parseFloat(metric.value),
          metric.unit || catalogMetric.canonical_unit,
          testDate || new Date()
        ]);

        matched.push(result.rows[0]);

      } else {
        // Add to unmatched list
        unmatched.push(metric);
      }

    } catch (error) {
      console.error(`Error inserting metric ${metric.name}:`, error);
      unmatched.push(metric);
    }
  }

  return { matched, unmatched };
}

/**
 * Get upload history
 */
async function getUploadHistory(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const result = await req.db.query(`
      SELECT 
        u.*,
        COUNT(DISTINCT m.id) as metrics_count
      FROM uploads u
      LEFT JOIN metrics m ON u.id = m.upload_id
      WHERE u.user_id = $1
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Get upload history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve upload history',
      message: error.message
    });
  }
}

/**
 * Get upload details
 */
async function getUploadDetails(req, res) {
  try {
    const userId = req.user.id;
    const { uploadId } = req.params;

    const uploadResult = await req.db.query(
      'SELECT * FROM uploads WHERE id = $1 AND user_id = $2',
      [uploadId, userId]
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    const upload = uploadResult.rows[0];

    // Get associated metrics
    const metricsResult = await req.db.query(`
      SELECT m.*, hs.name as system_name
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.upload_id = $1
      ORDER BY m.system_id, m.metric_name
    `, [uploadId]);

    res.json({
      success: true,
      data: {
        upload: upload,
        metrics: metricsResult.rows,
        metricsCount: metricsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Get upload details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve upload details',
      message: error.message
    });
  }
}

/**
 * Delete upload
 */
async function deleteUpload(req, res) {
  try {
    const userId = req.user.id;
    const { uploadId } = req.params;

    // Get upload info
    const uploadResult = await req.db.query(
      'SELECT * FROM uploads WHERE id = $1 AND user_id = $2',
      [uploadId, userId]
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    const upload = uploadResult.rows[0];

    // Delete file from filesystem
    try {
      await fs.unlink(upload.storage_path);
    } catch (fileError) {
      console.warn('Could not delete file:', fileError);
    }

    // Delete from database (metrics will be cascade deleted)
    await req.db.query(
      'DELETE FROM uploads WHERE id = $1 AND user_id = $2',
      [uploadId, userId]
    );

    res.json({
      success: true,
      message: 'Upload deleted successfully'
    });

  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete upload',
      message: error.message
    });
  }
}

/**
 * Retry failed upload processing
 */
async function retryUpload(req, res) {
  try {
    const userId = req.user.id;
    const { uploadId } = req.params;

    const uploadResult = await req.db.query(
      'SELECT * FROM uploads WHERE id = $1 AND user_id = $2 AND processing_status = $3',
      [uploadId, userId, 'failed']
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Failed upload not found'
      });
    }

    const upload = uploadResult.rows[0];

    // Reset status
    await req.db.query(
      'UPDATE uploads SET processing_status = $1, processing_error = NULL WHERE id = $2',
      ['pending', uploadId]
    );

    // Restart processing
    const file = {
      path: upload.storage_path,
      mimetype: upload.file_type,
      originalname: upload.filename
    };

    processUploadAsync(req.db, userId, upload, file)
      .catch(error => {
        console.error('[Retry Processing Error]', error);
      });

    res.json({
      success: true,
      message: 'Upload retry started'
    });

  } catch (error) {
    console.error('Retry upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retry upload',
      message: error.message
    });
  }
}

module.exports = {
  uploadFile,
  getUploadHistory,
  getUploadDetails,
  deleteUpload,
  retryUpload
};
