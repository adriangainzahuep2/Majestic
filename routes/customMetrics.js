const express = require('express');
const router = express.Router();
const { pool } = require('../database/schema');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

// Configure multer for CSV uploads
const upload = multer({ dest: 'uploads/' });

// GET /metrics/custom?systemId= - Get custom metrics for a system
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const systemId = req.query.systemId;

    if (!systemId) {
      return res.status(400).json({ error: 'systemId parameter is required' });
    }

    // Get official metrics from existing metrics table
    const officialMetrics = await pool.query(`
      SELECT 
        id,
        metric_name,
        metric_value as value,
        metric_unit as units,
        reference_range,
        test_date,
        is_key_metric,
        'official' as source_type
      FROM metrics 
      WHERE user_id = $1 AND system_id = $2 
      ORDER BY test_date DESC, is_key_metric DESC
    `, [userId, systemId]);

    // Get user's private custom metrics + approved global custom metrics
    const customMetrics = await pool.query(`
      SELECT 
        id,
        metric_name,
        value,
        units,
        normal_range_min,
        normal_range_max,
        range_applicable_to,
        source_type,
        review_status,
        created_at as test_date,
        false as is_key_metric
      FROM user_custom_metrics 
      WHERE system_id = $1 
        AND (user_id = $2 OR (source_type = 'official' AND review_status = 'approved'))
      ORDER BY created_at DESC
    `, [systemId, userId]);

    res.json({
      official: officialMetrics.rows,
      custom: customMetrics.rows,
      total: officialMetrics.rows.length + customMetrics.rows.length
    });

  } catch (error) {
    console.error('Error fetching custom metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// POST /metrics/custom - Add new custom metric
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      systemId,
      metricName,
      value,
      units,
      normalRangeMin,
      normalRangeMax,
      rangeApplicableTo = 'All'
    } = req.body;

    // Validate required fields
    if (!systemId || !metricName || !value || !units) {
      return res.status(400).json({ 
        error: 'systemId, metricName, value, and units are required' 
      });
    }

    // Validate system exists
    const systemCheck = await pool.query(
      'SELECT id FROM health_systems WHERE id = $1',
      [systemId]
    );

    if (systemCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid system ID' });
    }

    // Insert new custom metric
    const result = await pool.query(`
      INSERT INTO user_custom_metrics 
      (system_id, user_id, metric_name, value, units, normal_range_min, normal_range_max, range_applicable_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [systemId, userId, metricName, value, units, normalRangeMin, normalRangeMax, rangeApplicableTo]);

    console.log(`[CUSTOM METRIC ADDED] userId=${userId} systemId=${systemId} metric=${metricName}`);

    res.status(201).json({
      success: true,
      metric: result.rows[0]
    });

  } catch (error) {
    console.error('Error adding custom metric:', error);
    
    // Handle constraint violations
    if (error.code === '23514') { // CHECK constraint violation
      return res.status(400).json({ 
        error: 'Invalid value for units or range_applicable_to field' 
      });
    }
    
    res.status(500).json({ error: 'Failed to add custom metric' });
  }
});

// PUT /metrics/custom/:id - Edit custom metric
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const metricId = req.params.id;
    const {
      metricName,
      value,
      units,
      normalRangeMin,
      normalRangeMax,
      rangeApplicableTo
    } = req.body;

    // Check if metric exists and user has permission to edit
    const existingMetric = await pool.query(`
      SELECT * FROM user_custom_metrics 
      WHERE id = $1 AND (user_id = $2 OR $3 = true)
    `, [metricId, userId, req.user.isAdmin || false]);

    if (existingMetric.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Custom metric not found or permission denied' 
      });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (metricName !== undefined) {
      updates.push(`metric_name = $${paramCount}`);
      values.push(metricName);
      paramCount++;
    }
    if (value !== undefined) {
      updates.push(`value = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
    if (units !== undefined) {
      updates.push(`units = $${paramCount}`);
      values.push(units);
      paramCount++;
    }
    if (normalRangeMin !== undefined) {
      updates.push(`normal_range_min = $${paramCount}`);
      values.push(normalRangeMin);
      paramCount++;
    }
    if (normalRangeMax !== undefined) {
      updates.push(`normal_range_max = $${paramCount}`);
      values.push(normalRangeMax);
      paramCount++;
    }
    if (rangeApplicableTo !== undefined) {
      updates.push(`range_applicable_to = $${paramCount}`);
      values.push(rangeApplicableTo);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(metricId);
    const updateQuery = `
      UPDATE user_custom_metrics 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    console.log(`[CUSTOM METRIC UPDATED] userId=${userId} metricId=${metricId}`);

    res.json({
      success: true,
      metric: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating custom metric:', error);
    res.status(500).json({ error: 'Failed to update custom metric' });
  }
});

// DELETE /metrics/custom/:id - Delete custom metric
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const metricId = req.params.id;

    // Check if metric exists and user has permission to delete
    const existingMetric = await pool.query(`
      SELECT * FROM user_custom_metrics 
      WHERE id = $1 AND (user_id = $2 OR $3 = true)
    `, [metricId, userId, req.user.isAdmin || false]);

    if (existingMetric.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Custom metric not found or permission denied' 
      });
    }

    // Delete the metric
    await pool.query('DELETE FROM user_custom_metrics WHERE id = $1', [metricId]);

    console.log(`[CUSTOM METRIC DELETED] userId=${userId} metricId=${metricId}`);

    res.json({
      success: true,
      message: 'Custom metric deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting custom metric:', error);
    res.status(500).json({ error: 'Failed to delete custom metric' });
  }
});

// GET /metrics/custom/export - Export user custom metrics (admin only)
router.get('/export', async (req, res) => {
  try {
    // Check admin permission (implement based on your auth system)
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT 
        ucm.*,
        hs.name as system_name,
        u.email as user_email
      FROM user_custom_metrics ucm
      JOIN health_systems hs ON ucm.system_id = hs.id
      JOIN users u ON ucm.user_id = u.id
      ORDER BY ucm.created_at DESC
    `);

    // Convert to CSV format
    const csvHeaders = [
      'id', 'system_name', 'user_email', 'metric_name', 'value', 'units',
      'normal_range_min', 'normal_range_max', 'range_applicable_to',
      'source_type', 'review_status', 'created_at'
    ];

    const csvRows = result.rows.map(row => [
      row.id,
      row.system_name,
      row.user_email,
      row.metric_name,
      row.value,
      row.units,
      row.normal_range_min || '',
      row.normal_range_max || '',
      row.range_applicable_to,
      row.source_type,
      row.review_status,
      row.created_at
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="user_custom_metrics.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error exporting custom metrics:', error);
    res.status(500).json({ error: 'Failed to export metrics' });
  }
});

// POST /metrics/custom/import - Import updated custom metrics (admin only)
router.post('/import', upload.single('csvFile'), async (req, res) => {
  try {
    // Check admin permission
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const results = [];
    const errors = [];

    // Parse CSV file
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        results.push(row);
      })
      .on('end', async () => {
        const client = await pool.connect();
        
        try {
          await client.query('BEGIN');

          for (const row of results) {
            try {
              // Update existing metric if ID provided
              if (row.id) {
                await client.query(`
                  UPDATE user_custom_metrics 
                  SET 
                    source_type = $1,
                    review_status = $2
                  WHERE id = $3
                `, [row.source_type, row.review_status, row.id]);
              }
            } catch (error) {
              errors.push(`Row ${row.id}: ${error.message}`);
            }
          }

          await client.query('COMMIT');

          // Clean up uploaded file
          fs.unlinkSync(req.file.path);

          res.json({
            success: true,
            updated: results.length - errors.length,
            errors: errors
          });

        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        res.status(500).json({ error: 'Failed to parse CSV file' });
      });

  } catch (error) {
    console.error('Error importing custom metrics:', error);
    res.status(500).json({ error: 'Failed to import metrics' });
  }
});

module.exports = router;