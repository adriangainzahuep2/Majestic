const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = './uploads';
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|dcm|dicom/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                     file.mimetype === 'application/dicom' ||
                     file.mimetype === 'application/octet-stream'; // DICOM files
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, PDF, and DICOM files are allowed'));
    }
  }
});

// POST /ingestFile - Main ingestion endpoint
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { testDate } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[INGESTION] Starting file ingestion: ${file.originalname} for user ${userId}`);

    // Read file data for processing
    const fileData = await fs.readFile(file.path);
    const base64Data = fileData.toString('base64');

    // Get ingestion service
    const ingestionService = require('../services/ingestionService');
    
    // Process the file through the unified pipeline
    const result = await ingestionService.processFile({
      userId,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        base64Data
      },
      testDate: testDate || new Date().toISOString().split('T')[0]
    });

    // Clean up temporary file
    await fs.unlink(file.path).catch(console.error);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[INGESTION] Error:', error);
    
    // Clean up file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    res.status(500).json({
      error: 'File ingestion failed',
      message: error.message
    });
  }
});

module.exports = router;