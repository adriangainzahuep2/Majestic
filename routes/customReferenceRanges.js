const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Get user's custom reference ranges
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await pool.query(`
      SELECT 
        id,
        metric_name,
        min_value,
        max_value,
        units,
        medical_condition,
        condition_details,
        notes,
        valid_from,
        valid_until,
        is_active,
        created_at,
        updated_at,
        CASE 
          WHEN valid_until IS NULL OR valid_until >= CURRENT_DATE THEN true
          ELSE false
        END as is_current
      FROM custom_reference_ranges
      WHERE user_id = $1 AND is_active = true
      ORDER BY metric_name, created_at DESC
    `, [userId]);

    // Group by metric name to show current and historical ranges
    const groupedRanges = {};
    result.rows.forEach(range => {
      if (!groupedRanges[range.metric_name]) {
        groupedRanges[range.metric_name] = [];
      }
      groupedRanges[range.metric_name].push(range);
    });

    res.json({
      success: true,
      custom_ranges: result.rows,
      grouped_ranges: groupedRanges,
      total_active: result.rows.filter(r => r.is_current).length
    });

  } catch (error) {
    console.error('Error getting custom reference ranges:', error);
    res.status(500).json({
      error: 'Failed to get custom reference ranges',
      message: error.message
    });
  }
});

// Create new custom reference range
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      metric_name,
      min_value,
      max_value,
      units,
      medical_condition,
      condition_details,
      notes,
      valid_from,
      valid_until
    } = req.body;

    // Validation
    if (!metric_name || !min_value || !max_value || !units || !medical_condition) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'metric_name, min_value, max_value, units, and medical_condition are required'
      });
    }

    if (parseFloat(min_value) >= parseFloat(max_value)) {
      return res.status(400).json({
        error: 'Invalid range',
        message: 'Minimum value must be less than maximum value'
      });
    }

    // Check for overlapping ranges
    const overlapCheck = await pool.query(`
      SELECT id FROM custom_reference_ranges
      WHERE user_id = $1 AND metric_name = $2 AND medical_condition = $3 
      AND is_active = true
      AND (
        (valid_from <= $4 AND (valid_until IS NULL OR valid_until >= $4)) OR
        (valid_from <= $5 AND (valid_until IS NULL OR valid_until >= $5)) OR
        ($4 <= valid_from AND ($5 IS NULL OR $5 >= valid_from))
      )
    `, [
      userId, 
      metric_name, 
      medical_condition, 
      valid_from || new Date(), 
      valid_until
    ]);

    if (overlapCheck.rows.length > 0) {
      return res.status(409).json({
        error: 'Overlapping range exists',
        message: 'A custom range for this metric and condition already exists for the specified date period'
      });
    }

    // Insert new custom range
    const result = await pool.query(`
      INSERT INTO custom_reference_ranges (
        user_id, metric_name, min_value, max_value, units, 
        medical_condition, condition_details, notes, valid_from, valid_until
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      userId,
      metric_name,
      min_value,
      max_value,
      units,
      medical_condition,
      condition_details,
      notes,
      valid_from || new Date().toISOString().split('T')[0],
      valid_until
    ]);

    res.status(201).json({
      success: true,
      custom_range: result.rows[0],
      message: 'Custom reference range created successfully'
    });

  } catch (error) {
    console.error('Error creating custom reference range:', error);
    res.status(500).json({
      error: 'Failed to create custom reference range',
      message: error.message
    });
  }
});

// Update custom reference range
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const rangeId = req.params.id;
    const {
      metric_name,
      min_value,
      max_value,
      units,
      medical_condition,
      condition_details,
      notes,
      valid_from,
      valid_until,
      is_active
    } = req.body;

    // Check if range belongs to user
    const existingRange = await pool.query(`
      SELECT * FROM custom_reference_ranges 
      WHERE id = $1 AND user_id = $2
    `, [rangeId, userId]);

    if (existingRange.rows.length === 0) {
      return res.status(404).json({
        error: 'Custom range not found',
        message: 'The specified custom range does not exist or does not belong to you'
      });
    }

    // Validation
    if (min_value && max_value && parseFloat(min_value) >= parseFloat(max_value)) {
      return res.status(400).json({
        error: 'Invalid range',
        message: 'Minimum value must be less than maximum value'
      });
    }

    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    const fields = {
      metric_name, min_value, max_value, units, medical_condition,
      condition_details, notes, valid_from, valid_until, is_active
    };

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No fields to update',
        message: 'At least one field must be provided for update'
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(rangeId, userId);

    const result = await pool.query(`
      UPDATE custom_reference_ranges 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `, values);

    res.json({
      success: true,
      custom_range: result.rows[0],
      message: 'Custom reference range updated successfully'
    });

  } catch (error) {
    console.error('Error updating custom reference range:', error);
    res.status(500).json({
      error: 'Failed to update custom reference range',
      message: error.message
    });
  }
});

// Soft delete custom reference range
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const rangeId = req.params.id;

    const result = await pool.query(`
      UPDATE custom_reference_ranges 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [rangeId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Custom range not found',
        message: 'The specified custom range does not exist or does not belong to you'
      });
    }

    res.json({
      success: true,
      message: 'Custom reference range deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting custom reference range:', error);
    res.status(500).json({
      error: 'Failed to delete custom reference range',
      message: error.message
    });
  }
});

// Get custom range for specific metric (used during metric evaluation)
router.get('/metric/:metricName', async (req, res) => {
  try {
    const userId = req.user.userId;
    const metricName = req.params.metricName;
    const testDate = req.query.testDate || new Date().toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT * FROM custom_reference_ranges
      WHERE user_id = $1 AND metric_name = $2 AND is_active = true
      AND (valid_from IS NULL OR valid_from <= $3)
      AND (valid_until IS NULL OR valid_until >= $3)
      ORDER BY valid_from DESC
      LIMIT 1
    `, [userId, metricName, testDate]);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        custom_range: null,
        message: 'No custom range found for this metric and date'
      });
    }

    res.json({
      success: true,
      custom_range: result.rows[0]
    });

  } catch (error) {
    console.error('Error getting custom range for metric:', error);
    res.status(500).json({
      error: 'Failed to get custom range',
      message: error.message
    });
  }
});

// Get available metrics for dropdown
router.get('/available-metrics', async (req, res) => {
  try {
    // Load standard metrics from unified catalog
    const catalog = require('../shared/metricsCatalog');
    const standardMetrics = catalog.getAllMetrics().map(m => ({
      name: m.metric,
      system: m.system,
      units: m.units,
      normalRangeMin: m.normalRangeMin,
      normalRangeMax: m.normalRangeMax
    }));

    // Also get user's previously used custom metrics
    const userId = req.user.userId;
    const customMetricsResult = await pool.query(`
      SELECT DISTINCT metric_name, units
      FROM custom_reference_ranges
      WHERE user_id = $1 AND is_active = true
      ORDER BY metric_name
    `, [userId]);

    const customMetrics = customMetricsResult.rows.map(m => ({
      name: m.metric_name,
      units: m.units,
      source: 'custom'
    }));

    res.json({
      success: true,
      standard_metrics: standardMetrics,
      custom_metrics: customMetrics
    });

  } catch (error) {
    console.error('Error getting available metrics:', error);
    res.status(500).json({
      error: 'Failed to get available metrics',
      message: error.message
    });
  }
});

module.exports = router;
