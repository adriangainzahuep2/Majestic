/**
 * Spreadsheet Module API Routes
 * Handles spreadsheet upload, analysis, and version management
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const spreadsheetModuleService = require('../services/spreadsheetModuleService');

// Configure multer for spreadsheet uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.endsWith('.xlsx') || 
        file.originalname.endsWith('.xls') || 
        file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported. Please upload Excel (.xlsx, .xls) or CSV files.`), false);
    }
  }
});

// POST /spreadsheets/upload - Upload and process spreadsheet
router.post('/upload', upload.single('spreadsheet'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No spreadsheet file uploaded'
      });
    }

    const userId = req.user.id;
    const { testDate } = req.body;
    
    // Save file temporarily for processing
    const filePath = path.join('/tmp', req.file.originalname);
    require('fs').writeFileSync(filePath, req.file.buffer);
    
    const fileData = {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: filePath
    };

    const result = await spreadsheetModuleService.processSpreadsheet(
      userId, 
      fileData, 
      testDate || new Date().toISOString().split('T')[0]
    );

    // Clean up temporary file
    try {
      require('fs').unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('[SPREADSHEET] Failed to cleanup temp file:', cleanupError.message);
    }

    res.status(201).json({
      success: true,
      data: result,
      message: 'Spreadsheet processed successfully'
    });

  } catch (error) {
    console.error('[SPREADSHEET] Upload error:', error);
    res.status(500).json({
      error: 'Spreadsheet processing failed',
      message: error.message
    });
  }
});

// GET /spreadsheets/versions - Get all spreadsheet versions
router.get('/versions', async (req, res) => {
  try {
    const userId = req.user.id;
    const versions = await getSpreadsheetVersions();
    
    res.json({
      success: true,
      data: versions
    });

  } catch (error) {
    console.error('[SPREADSHEET] Get versions error:', error);
    res.status(500).json({
      error: 'Failed to get versions',
      message: error.message
    });
  }
});

// GET /spreadsheets/versions/:version - Get specific version details
router.get('/versions/:version', async (req, res) => {
  try {
    const userId = req.user.id;
    const version = req.params.version;
    
    const versionDetails = await getVersionDetails(version);
    
    if (!versionDetails) {
      return res.status(404).json({
        error: 'Version not found'
      });
    }

    res.json({
      success: true,
      data: versionDetails
    });

  } catch (error) {
    console.error('[SPREADSHEET] Get version error:', error);
    res.status(500).json({
      error: 'Failed to get version',
      message: error.message
    });
  }
});

// POST /spreadsheets/rollback/:version - Rollback to specific version
router.post('/rollback/:version', async (req, res) => {
  try {
    const userId = req.user.id;
    const version = req.params.version;
    const { confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({
        error: 'Rollback confirmation required',
        message: 'Please set confirm: true to proceed with rollback'
      });
    }
    
    const result = await spreadsheetModuleService.rollbackToVersion(version, userId);
    
    res.json({
      success: true,
      data: result,
      message: `Successfully rolled back to version ${version}`
    });

  } catch (error) {
    console.error('[SPREADSHEET] Rollback error:', error);
    res.status(500).json({
      error: 'Rollback failed',
      message: error.message
    });
  }
});

// GET /spreadsheets/changes/:version - Get changes for specific version
router.get('/changes/:version', async (req, res) => {
  try {
    const userId = req.user.id;
    const version = req.params.version;
    
    const changes = await getVersionChanges(version);
    
    res.json({
      success: true,
      data: changes
    });

  } catch (error) {
    console.error('[SPREADSHEET] Get changes error:', error);
    res.status(500).json({
      error: 'Failed to get changes',
      message: error.message
    });
  }
});

// POST /spreadsheets/validate - Validate spreadsheet without applying changes
router.post('/validate', upload.single('spreadsheet'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No spreadsheet file uploaded'
      });
    }

    const userId = req.user.id;
    
    // Save file temporarily
    const filePath = path.join('/tmp', `validate_${req.file.originalname}`);
    require('fs').writeFileSync(filePath, req.file.buffer);
    
    const fileData = {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: filePath
    };

    // Parse spreadsheet
    const spreadsheetData = await spreadsheetModuleService.parseSpreadsheet(fileData);
    
    // Get current data for comparison
    const currentMasterData = await spreadsheetModuleService.getCurrentMasterData();
    
    // Analyze changes only
    const changeAnalysis = await spreadsheetModuleService.analyzeChanges(currentMasterData, spreadsheetData);
    
    // Validate mapping
    const mappingValidation = await spreadsheetModuleService.validateDatabaseMapping(changeAnalysis);
    
    // Clean up
    try {
      require('fs').unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('[SPREADSHEET] Failed to cleanup temp file:', cleanupError.message);
    }

    res.json({
      success: true,
      data: {
        spreadsheetInfo: {
          filename: req.file.originalname,
          metricsCount: spreadsheetData.length
        },
        changeAnalysis: {
          summary: changeAnalysis.summary,
          added: changeAnalysis.added.slice(0, 10), // Limit for response
          modified: changeAnalysis.modified.slice(0, 10),
          deleted: changeAnalysis.deleted.slice(0, 10)
        },
        validation: {
          isValid: mappingValidation.isValid,
          errors: mappingValidation.errors,
          warnings: mappingValidation.warnings
        },
        recommendations: spreadsheetModuleService.generateRecommendations(changeAnalysis, mappingValidation)
      }
    });

  } catch (error) {
    console.error('[SPREADSHEET] Validation error:', error);
    res.status(500).json({
      error: 'Validation failed',
      message: error.message
    });
  }
});

// GET /spreadsheets/current - Get current spreadsheet state
router.get('/current', async (req, res) => {
  try {
    const userId = req.user.id;
    const currentState = await getCurrentSpreadsheetState();
    
    res.json({
      success: true,
      data: currentState
    });

  } catch (error) {
    console.error('[SPREADSHEET] Get current error:', error);
    res.status(500).json({
      error: 'Failed to get current state',
      message: error.message
    });
  }
});

// DELETE /spreadsheets/versions/:version - Delete version backup
router.delete('/versions/:version', async (req, res) => {
  try {
    const userId = req.user.id;
    const version = req.params.version;
    const { confirm } = req.body;
    
    if (!confirm) {
      return res.status(400).json({
        error: 'Deletion confirmation required',
        message: 'Please set confirm: true to proceed with deletion'
      });
    }
    
    await deleteVersion(version);
    
    res.json({
      success: true,
      message: `Version ${version} deleted successfully`
    });

  } catch (error) {
    console.error('[SPREADSHEET] Delete version error:', error);
    res.status(500).json({
      error: 'Failed to delete version',
      message: error.message
    });
  }
});

// GET /spreadsheets/templates/download - Download spreadsheet template
router.get('/templates/download', async (req, res) => {
  try {
    const userId = req.user.id;
    const template = await generateSpreadsheetTemplate();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="majestic_template.xlsx"');
    
    res.send(template);

  } catch (error) {
    console.error('[SPREADSHEET] Template download error:', error);
    res.status(500).json({
      error: 'Failed to generate template',
      message: error.message
    });
  }
});

// Helper functions (would be implemented in service)
async function getSpreadsheetVersions() {
  return [];
}

async function getVersionDetails(version) {
  return null;
}

async function getVersionChanges(version) {
  return null;
}

async function getCurrentSpreadsheetState() {
  return {};
}

async function deleteVersion(version) {
  return true;
}

async function generateSpreadsheetTemplate() {
  // Would generate Excel template
  return Buffer.from('template data');
}

module.exports = router;
