/**
 * Uploads API Routes
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const ingestionService = require('../services/ingestionService');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common medical file types
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'image/dicom',
      'application/dicom',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not supported`), false);
    }
  }
});

// POST /uploads - Upload and process medical file
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    const userId = req.user.id;
    const { testDate } = req.body;
    
    // Prepare file data
    const fileData = {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer
    };

    // Convert buffer to base64 for ingestion service
    const base64Data = fileData.buffer.toString('base64');
    
    const result = await ingestionService.processFile({
      userId,
      file: {
        ...fileData,
        base64Data
      },
      testDate: testDate || new Date().toISOString().split('T')[0]
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'File processed successfully'
    });

  } catch (error) {
    console.error('[UPLOADS] Process file error:', error);
    res.status(500).json({
      error: 'File processing failed',
      message: error.message
    });
  }
});

// POST /uploads/batch - Upload multiple files
router.post('/batch', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded'
      });
    }

    const userId = req.user.id;
    const { testDate } = req.body;
    
    // Process files in parallel
    const uploadPromises = req.files.map(async (file) => {
      const base64Data = file.buffer.toString('base64');
      
      return await ingestionService.processFile({
        userId,
        file: {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          base64Data
        },
        testDate: testDate || new Date().toISOString().split('T')[0]
      });
    });

    const results = await Promise.allSettled(uploadPromises);
    
    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    res.status(201).json({
      success: true,
      data: {
        totalFiles: req.files.length,
        successful: successful.length,
        failed: failed.length,
        results: results.map((result, index) => ({
          filename: req.files[index].originalname,
          status: result.status,
          result: result.status === 'fulfilled' ? result.value : { error: result.reason.message }
        }))
      }
    });

  } catch (error) {
    console.error('[UPLOADS] Batch upload error:', error);
    res.status(500).json({
      error: 'Batch upload failed',
      message: error.message
    });
  }
});

// GET /uploads - Get user's upload history
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;
    
    // This would need to be implemented in a service
    // For now, return mock data
    const uploads = await getUserUploads(userId, { limit: parseInt(limit), offset: parseInt(offset) });
    
    res.json({
      success: true,
      data: uploads
    });

  } catch (error) {
    console.error('[UPLOADS] Get uploads error:', error);
    res.status(500).json({
      error: 'Failed to get uploads',
      message: error.message
    });
  }
});

// GET /uploads/:id - Get specific upload details
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const uploadId = req.params.id;
    
    const upload = await getUploadById(userId, uploadId);

    if (!upload) {
      return res.status(404).json({
        error: 'Upload not found'
      });
    }

    res.json({
      success: true,
      data: upload
    });

  } catch (error) {
    console.error('[UPLOADS] Get upload error:', error);
    res.status(500).json({
      error: 'Failed to get upload',
      message: error.message
    });
  }
});

// GET /uploads/:id/metrics - Get metrics extracted from specific upload
router.get('/:id/metrics', async (req, res) => {
  try {
    const userId = req.user.id;
    const uploadId = req.params.id;
    
    const metrics = await getMetricsFromUpload(userId, uploadId);
    
    res.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    console.error('[UPLOADS] Get upload metrics error:', error);
    res.status(500).json({
      error: 'Failed to get upload metrics',
      message: error.message
    });
  }
});

// DELETE /uploads/:id - Delete upload and associated data
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const uploadId = req.params.id;
    
    await deleteUpload(userId, uploadId);
    
    res.json({
      success: true,
      message: 'Upload deleted successfully'
    });

  } catch (error) {
    console.error('[UPLOADS] Delete upload error:', error);
    res.status(500).json({
      error: 'Failed to delete upload',
      message: error.message
    });
  }
});

// Helper functions (would be implemented in service)
async function getUserUploads(userId, { limit, offset }) {
  // Implementation would query the database
  return [];
}

async function getUploadById(userId, uploadId) {
  // Implementation would query the database
  return null;
}

async function getMetricsFromUpload(userId, uploadId) {
  // Implementation would query the database
  return [];
}

async function deleteUpload(userId, uploadId) {
  // Implementation would delete from database and storage
  return true;
}

module.exports = router;
