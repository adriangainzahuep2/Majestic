const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const ingestionService = require('../services/ingestionService');

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
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|dcm|dicom/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.includes('dicom');
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, documents, and DICOM files are allowed'));
    }
  },
}).single('file');

async function uploadFile(req, res) {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    try {
      const userId = req.user.id;
      const file = req.file;
      const { testDate } = req.body;

      console.log(`[Upload] User ${userId} uploaded: ${file.originalname}`);

      const fileData = await fs.readFile(file.path);
      const base64Data = fileData.toString('base64');

      const result = await ingestionService.processFile({
        userId,
        file: { ...file, base64Data },
        testDate: testDate || new Date().toISOString().split('T')[0],
      });

      await fs.unlink(file.path);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Upload file error:', error);
      res.status(500).json({ success: false, error: 'Failed to process file', message: error.message });
    }
  });
}

async function getUploadHistory(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    const result = await req.db.query(
      `SELECT u.*, COUNT(DISTINCT m.id) as metrics_count
       FROM uploads u
       LEFT JOIN metrics m ON u.id = m.upload_id
       WHERE u.user_id = $1
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get upload history error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve upload history', message: error.message });
  }
}

async function getUploadDetails(req, res) {
  try {
    const userId = req.user.id;
    const { uploadId } = req.params;
    const uploadResult = await req.db.query('SELECT * FROM uploads WHERE id = $1 AND user_id = $2', [uploadId, userId]);

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Upload not found' });
    }

    const metricsResult = await req.db.query(
      `SELECT m.*, hs.name as system_name
       FROM metrics m
       LEFT JOIN health_systems hs ON m.system_id = hs.id
       WHERE m.upload_id = $1
       ORDER BY m.system_id, m.metric_name`,
      [uploadId]
    );

    res.json({
      success: true,
      data: {
        upload: uploadResult.rows[0],
        metrics: metricsResult.rows,
        metricsCount: metricsResult.rows.length,
      },
    });
  } catch (error) {
    console.error('Get upload details error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve upload details', message: error.message });
  }
}

async function deleteUpload(req, res) {
  try {
    const userId = req.user.id;
    const { uploadId } = req.params;
    const uploadResult = await req.db.query('SELECT * FROM uploads WHERE id = $1 AND user_id = $2', [uploadId, userId]);

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Upload not found' });
    }

    try {
      await fs.unlink(uploadResult.rows[0].storage_path);
    } catch (fileError) {
      console.warn('Could not delete file:', fileError);
    }

    await req.db.query('DELETE FROM uploads WHERE id = $1 AND user_id = $2', [uploadId, userId]);
    res.json({ success: true, message: 'Upload deleted successfully' });
  } catch (error) {
    console.error('Delete upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete upload', message: error.message });
  }
}

async function retryUpload(req, res) {
  try {
    const userId = req.user.id;
    const { uploadId } = req.params;
    const uploadResult = await req.db.query(
      'SELECT * FROM uploads WHERE id = $1 AND user_id = $2 AND processing_status = $3',
      [uploadId, userId, 'failed']
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Failed upload not found' });
    }

    await req.db.query('UPDATE uploads SET processing_status = $1, processing_error = NULL WHERE id = $2', ['pending', uploadId]);
    const file = {
      path: uploadResult.rows[0].storage_path,
      mimetype: uploadResult.rows[0].file_type,
      originalname: uploadResult.rows[0].filename,
    };
    ingestionService.processFile({ userId, file, testDate: new Date().toISOString().split('T')[0] });
    res.json({ success: true, message: 'Upload retry started' });
  } catch (error) {
    console.error('Retry upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to retry upload', message: error.message });
  }
}

module.exports = {
  uploadFile,
  getUploadHistory,
  getUploadDetails,
  deleteUpload,
  retryUpload,
};
