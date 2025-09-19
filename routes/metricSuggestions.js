const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Get pending metric suggestions for user
router.get('/pending', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(`
      SELECT 
        pms.*,
        u.filename as upload_filename,
        u.created_at as upload_date
      FROM pending_metric_suggestions pms
      JOIN uploads u ON pms.upload_id = u.id
      WHERE pms.user_id = $1 AND pms.status = 'pending'
      ORDER BY pms.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      pending_suggestions: result.rows
    });

  } catch (error) {
    console.error('Error getting pending suggestions:', error);
    res.status(500).json({
      error: 'Failed to get pending suggestions',
      message: error.message
    });
  }
});

// Approve/reject metric suggestions
router.post('/:suggestionId/review', async (req, res) => {
  try {
    const userId = req.user.userId;
    const suggestionId = req.params.suggestionId;
    const { approved_mappings, rejected_metrics } = req.body;

    // Get the pending suggestion
    const suggestionResult = await pool.query(`
      SELECT * FROM pending_metric_suggestions 
      WHERE id = $1 AND user_id = $2
    `, [suggestionId, userId]);

    if (suggestionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    const suggestion = suggestionResult.rows[0];

    // Begin transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Process approved mappings - save to metrics table
      if (approved_mappings && approved_mappings.length > 0) {
        const healthSystemsService = require('../services/healthSystems');
        const catalog = require('../shared/metricsCatalog');

        for (const mapping of approved_mappings) {
          const { original_metric, approved_standard_name } = mapping;
          
          // Find the original metric data
          const originalMetric = suggestion.unmatched_metrics.find(m => 
            m.name === original_metric.name
          );

          if (originalMetric) {
            // Map to system
            const systemId = healthSystemsService.mapMetricToSystem(
              approved_standard_name, 
              originalMetric.category
            );

            // Get reference data
            const range = catalog.getRangeForName(approved_standard_name);
            const referenceRange = range && range.min !== undefined && range.max !== undefined
              ? `${range.min}-${range.max}`
              : originalMetric.reference_range;

            const isKeyMetric = healthSystemsService.isKeyMetric(systemId, approved_standard_name);

            // Insert the metric
            await client.query(`
              INSERT INTO metrics (user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, test_date)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              ON CONFLICT (user_id, metric_name, test_date, upload_id) DO UPDATE SET
                metric_value = EXCLUDED.metric_value,
                metric_unit = EXCLUDED.metric_unit,
                reference_range = EXCLUDED.reference_range,
                is_key_metric = EXCLUDED.is_key_metric
            `, [
              userId,
              suggestion.upload_id,
              systemId,
              approved_standard_name,
              originalMetric.value,
              originalMetric.unit,
              referenceRange,
              isKeyMetric,
              suggestion.test_date
            ]);
          }
        }
      }

      // Mark suggestion as processed
      await client.query(`
        UPDATE pending_metric_suggestions 
        SET status = 'processed', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [suggestionId]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Processed ${approved_mappings?.length || 0} approved mappings`,
        approved_count: approved_mappings?.length || 0,
        rejected_count: rejected_metrics?.length || 0
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error processing metric suggestions:', error);
    res.status(500).json({
      error: 'Failed to process suggestions',
      message: error.message
    });
  }
});

// Get suggestion statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_pending,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as recent
      FROM pending_metric_suggestions 
      WHERE user_id = $1
    `, [userId]);

    res.json({
      success: true,
      stats: result.rows[0]
    });

  } catch (error) {
    console.error('Error getting suggestion stats:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

module.exports = router;
