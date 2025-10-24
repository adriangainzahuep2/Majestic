/**
 * Custom Metrics Controller
 * Handles user-defined custom metrics
 * Fixes: Force numeric storage for min/max values (addresses null/string issue for LDL Particle Size, etc.)
 */

/**
 * Create custom metric
 */
async function createCustomMetric(req, res) {
  try {
    const userId = req.user.id;
    const {
      system_id,
      metric_name,
      value,
      units,
      normal_range_min,
      normal_range_max,
      range_applicable_to,
      source_type
    } = req.body;

    // Validate required fields
    if (!metric_name || !value) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: metric_name and value are required'
      });
    }

    // CRITICAL: Force numeric conversion for range values to fix string storage issue
    let numericMin = null;
    let numericMax = null;

    if (normal_range_min !== null && normal_range_min !== undefined && normal_range_min !== '') {
      numericMin = parseFloat(normal_range_min);
      if (isNaN(numericMin)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid normal_range_min: must be a number'
        });
      }
    }

    if (normal_range_max !== null && normal_range_max !== undefined && normal_range_max !== '') {
      numericMax = parseFloat(normal_range_max);
      if (isNaN(numericMax)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid normal_range_max: must be a number'
        });
      }
    }

    const result = await req.db.query(`
      INSERT INTO user_custom_metrics (
        user_id,
        system_id,
        metric_name,
        value,
        units,
        normal_range_min,
        normal_range_max,
        range_applicable_to,
        source_type,
        review_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      userId,
      system_id || null,
      metric_name,
      value,
      units || null,
      numericMin,  // Already converted to number
      numericMax,  // Already converted to number
      range_applicable_to || 'General',
      source_type || 'user',
      'approved'
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Custom metric created successfully'
    });

  } catch (error) {
    console.error('Create custom metric error:', error);
    
    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'This custom metric already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create custom metric',
      message: error.message
    });
  }
}

/**
 * Get all custom metrics for user
 */
async function getCustomMetrics(req, res) {
  try {
    const userId = req.user.id;
    const { systemId, reviewStatus } = req.query;

    let query = `
      SELECT 
        ucm.*,
        hs.name as system_name
      FROM user_custom_metrics ucm
      LEFT JOIN health_systems hs ON ucm.system_id = hs.id
      WHERE ucm.user_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    if (systemId) {
      paramCount++;
      query += ` AND ucm.system_id = $${paramCount}`;
      params.push(systemId);
    }

    if (reviewStatus) {
      paramCount++;
      query += ` AND ucm.review_status = $${paramCount}`;
      params.push(reviewStatus);
    }

    query += ` ORDER BY ucm.created_at DESC`;

    const result = await req.db.query(query, params);

    // Ensure all range values are numeric
    const metricsWithNumericRanges = result.rows.map(metric => {
      if (metric.normal_range_min) {
        metric.normal_range_min = parseFloat(metric.normal_range_min);
      }
      if (metric.normal_range_max) {
        metric.normal_range_max = parseFloat(metric.normal_range_max);
      }
      return metric;
    });

    res.json({
      success: true,
      data: metricsWithNumericRanges,
      count: metricsWithNumericRanges.length
    });

  } catch (error) {
    console.error('Get custom metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve custom metrics',
      message: error.message
    });
  }
}

/**
 * Update custom metric
 */
async function updateCustomMetric(req, res) {
  try {
    const userId = req.user.id;
    const { metricId } = req.params;
    const {
      metric_name,
      value,
      units,
      normal_range_min,
      normal_range_max,
      range_applicable_to,
      review_status
    } = req.body;

    // Verify ownership
    const ownerCheck = await req.db.query(
      'SELECT id FROM user_custom_metrics WHERE id = $1 AND user_id = $2',
      [metricId, userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Custom metric not found or access denied'
      });
    }

    // Force numeric conversion for range values
    let numericMin = null;
    let numericMax = null;

    if (normal_range_min !== null && normal_range_min !== undefined && normal_range_min !== '') {
      numericMin = parseFloat(normal_range_min);
      if (isNaN(numericMin)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid normal_range_min: must be a number'
        });
      }
    }

    if (normal_range_max !== null && normal_range_max !== undefined && normal_range_max !== '') {
      numericMax = parseFloat(normal_range_max);
      if (isNaN(numericMax)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid normal_range_max: must be a number'
        });
      }
    }

    const result = await req.db.query(`
      UPDATE user_custom_metrics
      SET
        metric_name = COALESCE($1, metric_name),
        value = COALESCE($2, value),
        units = COALESCE($3, units),
        normal_range_min = $4,
        normal_range_max = $5,
        range_applicable_to = COALESCE($6, range_applicable_to),
        review_status = COALESCE($7, review_status)
      WHERE id = $8 AND user_id = $9
      RETURNING *
    `, [
      metric_name,
      value,
      units,
      numericMin,
      numericMax,
      range_applicable_to,
      review_status,
      metricId,
      userId
    ]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Custom metric updated successfully'
    });

  } catch (error) {
    console.error('Update custom metric error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update custom metric',
      message: error.message
    });
  }
}

/**
 * Delete custom metric
 */
async function deleteCustomMetric(req, res) {
  try {
    const userId = req.user.id;
    const { metricId } = req.params;

    const result = await req.db.query(
      'DELETE FROM user_custom_metrics WHERE id = $1 AND user_id = $2 RETURNING id',
      [metricId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Custom metric not found or access denied'
      });
    }

    res.json({
      success: true,
      message: 'Custom metric deleted successfully'
    });

  } catch (error) {
    console.error('Delete custom metric error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete custom metric',
      message: error.message
    });
  }
}

/**
 * Bulk import custom metrics (for admin or data migration)
 */
async function bulkImportCustomMetrics(req, res) {
  try {
    const userId = req.user.id;
    const { metrics } = req.body;

    if (!Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: metrics array is required'
      });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const metric of metrics) {
      try {
        // Force numeric conversion
        const numericMin = metric.normal_range_min !== null && metric.normal_range_min !== undefined
          ? parseFloat(metric.normal_range_min)
          : null;
        
        const numericMax = metric.normal_range_max !== null && metric.normal_range_max !== undefined
          ? parseFloat(metric.normal_range_max)
          : null;

        const result = await req.db.query(`
          INSERT INTO user_custom_metrics (
            user_id,
            system_id,
            metric_name,
            value,
            units,
            normal_range_min,
            normal_range_max,
            range_applicable_to,
            source_type,
            review_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `, [
          userId,
          metric.system_id || null,
          metric.metric_name,
          metric.value,
          metric.units || null,
          numericMin,
          numericMax,
          metric.range_applicable_to || 'General',
          metric.source_type || 'import',
          'approved'
        ]);

        results.success.push(result.rows[0]);
      } catch (error) {
        results.failed.push({
          metric: metric.metric_name,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Imported ${results.success.length} metrics, ${results.failed.length} failed`
    });

  } catch (error) {
    console.error('Bulk import custom metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import custom metrics',
      message: error.message
    });
  }
}

/**
 * Fix existing string values to numeric (migration utility)
 */
async function fixNumericRanges(req, res) {
  try {
    const userId = req.user.id;

    // Update all string values to numeric
    await req.db.query(`
      UPDATE user_custom_metrics
      SET 
        normal_range_min = CASE 
          WHEN normal_range_min IS NOT NULL 
          THEN CAST(normal_range_min AS DECIMAL(10,3))
          ELSE NULL
        END,
        normal_range_max = CASE 
          WHEN normal_range_max IS NOT NULL 
          THEN CAST(normal_range_max AS DECIMAL(10,3))
          ELSE NULL
        END
      WHERE user_id = $1
    `, [userId]);

    res.json({
      success: true,
      message: 'Numeric ranges fixed successfully'
    });

  } catch (error) {
    console.error('Fix numeric ranges error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fix numeric ranges',
      message: error.message
    });
  }
}

module.exports = {
  createCustomMetric,
  getCustomMetrics,
  updateCustomMetric,
  deleteCustomMetric,
  bulkImportCustomMetrics,
  fixNumericRanges
};
