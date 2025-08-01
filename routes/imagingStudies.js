const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// GET /imaging_studies?userId=... - Get all imaging studies for a user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, status, studyType } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = $1';
    let params = [userId];
    let paramIndex = 2;

    // Add optional filters
    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (studyType) {
      whereClause += ` AND study_type = $${paramIndex}`;
      params.push(studyType);
      paramIndex++;
    }

    const result = await pool.query(`
      SELECT 
        i.*,
        hs.name as system_name,
        hs.description as system_description
      FROM imaging_studies i
      LEFT JOIN health_systems hs ON i.linked_system_id = hs.id
      ${whereClause}
      ORDER BY i.test_date DESC, i.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]);

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM imaging_studies ${whereClause}
    `, params.slice(0, paramIndex - 1));

    // Process results to include thumbnail URLs
    const studies = result.rows.map(study => ({
      ...study,
      thumbnailUrl: study.thumbnail_url ? `/uploads/thumbnails/${study.thumbnail_url.split('/').pop()}` : null,
      fileUrl: study.file_url ? `/uploads/${study.file_url.split('/').pop()}` : null
    }));

    res.json({
      studies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });

  } catch (error) {
    console.error('[IMAGING_STUDIES] Get studies error:', error);
    res.status(500).json({
      error: 'Failed to fetch imaging studies',
      message: error.message
    });
  }
});

// GET /imaging_studies/:id - Get specific study details
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const studyId = req.params.id;

    const result = await pool.query(`
      SELECT 
        i.*,
        hs.name as system_name,
        hs.description as system_description
      FROM imaging_studies i
      LEFT JOIN health_systems hs ON i.linked_system_id = hs.id
      WHERE i.id = $1 AND i.user_id = $2
    `, [studyId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Study not found'
      });
    }

    const study = result.rows[0];
    
    // Process URLs
    study.thumbnailUrl = study.thumbnail_url ? `/uploads/thumbnails/${study.thumbnail_url.split('/').pop()}` : null;
    study.fileUrl = study.file_url ? `/uploads/${study.file_url.split('/').pop()}` : null;

    res.json(study);

  } catch (error) {
    console.error('[IMAGING_STUDIES] Get study details error:', error);
    res.status(500).json({
      error: 'Failed to fetch study details',
      message: error.message
    });
  }
});

// GET /imaging_studies/system/:systemId - Get studies for a specific system
router.get('/system/:systemId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const systemId = req.params.systemId;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT 
        i.*,
        hs.name as system_name
      FROM imaging_studies i
      LEFT JOIN health_systems hs ON i.linked_system_id = hs.id
      WHERE i.user_id = $1 AND i.linked_system_id = $2
      ORDER BY i.test_date DESC, i.created_at DESC
      LIMIT $3 OFFSET $4
    `, [userId, systemId, limit, offset]);

    // Get total count for this system
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM imaging_studies 
      WHERE user_id = $1 AND linked_system_id = $2
    `, [userId, systemId]);

    // Process results
    const studies = result.rows.map(study => ({
      ...study,
      thumbnailUrl: study.thumbnail_url ? `/uploads/thumbnails/${study.thumbnail_url.split('/').pop()}` : null,
      fileUrl: study.file_url ? `/uploads/${study.file_url.split('/').pop()}` : null,
      // Extract key metrics for display
      keyMetrics: this.extractKeyMetrics(study.metrics_json),
      trendSummary: study.comparison_summary
    }));

    res.json({
      studies,
      systemName: studies[0]?.system_name || null,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });

  } catch (error) {
    console.error('[IMAGING_STUDIES] Get system studies error:', error);
    res.status(500).json({
      error: 'Failed to fetch system studies',
      message: error.message
    });
  }
});

// Helper function to extract key metrics for display
function extractKeyMetrics(metricsJson) {
  if (!metricsJson || !Array.isArray(metricsJson)) {
    return [];
  }

  // Return up to 3 most important metrics for list display
  return metricsJson.slice(0, 3).map(metric => ({
    name: metric.name,
    value: metric.value,
    units: metric.units
  }));
}

// GET /imaging_studies/stats - Get statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const userId = req.user.userId;

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_studies,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_studies,
        COUNT(CASE WHEN status = 'pendingProcessing' THEN 1 END) as pending_studies,
        COUNT(CASE WHEN status = 'failedExtraction' THEN 1 END) as failed_studies,
        COUNT(DISTINCT study_type) as unique_study_types,
        COUNT(DISTINCT linked_system_id) as systems_with_studies
      FROM imaging_studies 
      WHERE user_id = $1
    `, [userId]);

    const studyTypeBreakdown = await pool.query(`
      SELECT 
        study_type,
        COUNT(*) as count,
        MAX(test_date) as latest_date
      FROM imaging_studies 
      WHERE user_id = $1 AND status = 'processed'
      GROUP BY study_type
      ORDER BY count DESC
    `, [userId]);

    res.json({
      summary: stats.rows[0],
      studyTypes: studyTypeBreakdown.rows
    });

  } catch (error) {
    console.error('[IMAGING_STUDIES] Get stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch study statistics',
      message: error.message
    });
  }
});

module.exports = router;