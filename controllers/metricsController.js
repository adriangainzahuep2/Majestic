const metricsCatalog = require('../shared/metricsCatalog');
const conversionService = require('../services/conversionService');
const referenceRangeService = require('../services/referenceRangeService');

/**
 * Metrics Controller
 * Handles all metric-related operations including retrieval, conversion, and validation
 */

/**
 * Get all metrics for a user with proper range mapping
 * Fixes: HDL range issue, null values for biomarkers
 */
async function getAllMetrics(req, res) {
  try {
    const userId = req.user.id;
    const { systemId, startDate, endDate } = req.query;

    let query = `
      SELECT 
        m.*,
        hs.name as system_name,
        u.filename as source_file
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      LEFT JOIN uploads u ON m.upload_id = u.id
      WHERE m.user_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    if (systemId) {
      paramCount++;
      query += ` AND m.system_id = $${paramCount}`;
      params.push(systemId);
    }

    if (startDate) {
      paramCount++;
      query += ` AND m.test_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND m.test_date <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY m.test_date DESC, m.created_at DESC`;

    const result = await req.db.query(query, params);

    // Fix reference ranges from master catalog
    const metricsWithCorrectRanges = await Promise.all(
      result.rows.map(async (metric) => {
        const catalogMetric = metricsCatalog.findMetricByName(metric.metric_name);
        
        if (catalogMetric) {
          // Get correct reference range based on user profile
          const userProfile = await getUserProfile(req.db, userId);
          const correctRange = referenceRangeService.getReferenceRange(
            catalogMetric.metric_id,
            userProfile
          );

          // Override with correct values
          if (correctRange) {
            metric.normal_min = parseFloat(correctRange.min);
            metric.normal_max = parseFloat(correctRange.max);
            metric.reference_range = `${correctRange.min}-${correctRange.max}`;
          }

          // Ensure metric values are numbers, not strings
          if (metric.metric_value && typeof metric.metric_value === 'string') {
            metric.metric_value = parseFloat(metric.metric_value);
          }
        }

        return metric;
      })
    );

    res.json({
      success: true,
      data: metricsWithCorrectRanges,
      count: metricsWithCorrectRanges.length
    });

  } catch (error) {
    console.error('Get all metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
}

/**
 * Get metrics by system
 */
async function getMetricsBySystem(req, res) {
  try {
    const userId = req.user.id;
    const { systemId } = req.params;

    const result = await req.db.query(`
      SELECT 
        m.*,
        hs.name as system_name
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.user_id = $1 AND m.system_id = $2
      ORDER BY m.test_date DESC
    `, [userId, systemId]);

    // Apply reference range fixes
    const metricsWithCorrectRanges = await applyReferenceRangeFixes(
      req.db,
      userId,
      result.rows
    );

    res.json({
      success: true,
      data: metricsWithCorrectRanges
    });

  } catch (error) {
    console.error('Get metrics by system error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
}

/**
 * Get metric history (timeline)
 */
async function getMetricHistory(req, res) {
  try {
    const userId = req.user.id;
    const { metricName } = req.params;

    const result = await req.db.query(`
      SELECT 
        m.*,
        u.filename as source_file
      FROM metrics m
      LEFT JOIN uploads u ON m.upload_id = u.id
      WHERE m.user_id = $1 AND m.metric_name = $2
      ORDER BY m.test_date ASC
    `, [userId, metricName]);

    // Apply reference range fixes and conversions
    const history = await Promise.all(
      result.rows.map(async (metric) => {
        const catalogMetric = metricsCatalog.findMetricByName(metric.metric_name);
        
        if (catalogMetric) {
          const userProfile = await getUserProfile(req.db, userId);
          const correctRange = referenceRangeService.getReferenceRange(
            catalogMetric.metric_id,
            userProfile
          );

          if (correctRange) {
            metric.normal_min = parseFloat(correctRange.min);
            metric.normal_max = parseFloat(correctRange.max);
          }

          // Ensure numeric values
          metric.metric_value = parseFloat(metric.metric_value);
        }

        return metric;
      })
    );

    res.json({
      success: true,
      data: history,
      count: history.length
    });

  } catch (error) {
    console.error('Get metric history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metric history',
      message: error.message
    });
  }
}

/**
 * Update metric value
 */
async function updateMetric(req, res) {
  try {
    const userId = req.user.id;
    const { metricId } = req.params;
    const { metric_value, metric_unit, reference_range, is_adjusted } = req.body;

    // Verify ownership
    const ownerCheck = await req.db.query(
      'SELECT id FROM metrics WHERE id = $1 AND user_id = $2',
      [metricId, userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Metric not found or access denied'
      });
    }

    // Ensure numeric value
    const numericValue = parseFloat(metric_value);

    const result = await req.db.query(`
      UPDATE metrics 
      SET 
        metric_value = $1,
        metric_unit = $2,
        reference_range = $3,
        is_adjusted = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND user_id = $6
      RETURNING *
    `, [numericValue, metric_unit, reference_range, is_adjusted || true, metricId, userId]);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update metric error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update metric',
      message: error.message
    });
  }
}

/**
 * Delete metric
 */
async function deleteMetric(req, res) {
  try {
    const userId = req.user.id;
    const { metricId } = req.params;

    const result = await req.db.query(
      'DELETE FROM metrics WHERE id = $1 AND user_id = $2 RETURNING id',
      [metricId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Metric not found or access denied'
      });
    }

    res.json({
      success: true,
      message: 'Metric deleted successfully'
    });

  } catch (error) {
    console.error('Delete metric error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete metric',
      message: error.message
    });
  }
}

/**
 * Get key metrics (outliers and important biomarkers)
 */
async function getKeyMetrics(req, res) {
  try {
    const userId = req.user.id;

    const result = await req.db.query(`
      SELECT 
        m.*,
        hs.name as system_name
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.user_id = $1 
        AND (m.is_key_metric = true OR m.is_outlier = true)
      ORDER BY m.test_date DESC
      LIMIT 50
    `, [userId]);

    const metricsWithCorrectRanges = await applyReferenceRangeFixes(
      req.db,
      userId,
      result.rows
    );

    res.json({
      success: true,
      data: metricsWithCorrectRanges
    });

  } catch (error) {
    console.error('Get key metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve key metrics',
      message: error.message
    });
  }
}

/**
 * Get outlier metrics
 */
async function getOutliers(req, res) {
  try {
    const userId = req.user.id;

    const result = await req.db.query(`
      SELECT 
        m.*,
        hs.name as system_name
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.user_id = $1 AND m.is_outlier = true
      ORDER BY m.test_date DESC
    `, [userId]);

    const metricsWithCorrectRanges = await applyReferenceRangeFixes(
      req.db,
      userId,
      result.rows
    );

    res.json({
      success: true,
      data: metricsWithCorrectRanges,
      count: metricsWithCorrectRanges.length
    });

  } catch (error) {
    console.error('Get outliers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve outlier metrics',
      message: error.message
    });
  }
}

/**
 * Helper: Get user profile
 */
async function getUserProfile(db, userId) {
  const result = await db.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || {};
}

/**
 * Helper: Apply reference range fixes to metrics
 */
async function applyReferenceRangeFixes(db, userId, metrics) {
  const userProfile = await getUserProfile(db, userId);

  return Promise.all(
    metrics.map(async (metric) => {
      const catalogMetric = metricsCatalog.findMetricByName(metric.metric_name);
      
      if (catalogMetric) {
        const correctRange = referenceRangeService.getReferenceRange(
          catalogMetric.metric_id,
          userProfile
        );

        if (correctRange) {
          metric.normal_min = parseFloat(correctRange.min);
          metric.normal_max = parseFloat(correctRange.max);
          metric.reference_range = `${correctRange.min}-${correctRange.max}`;
        }

        // Force numeric values
        if (metric.metric_value) {
          metric.metric_value = parseFloat(metric.metric_value);
        }
        if (metric.normal_min) {
          metric.normal_min = parseFloat(metric.normal_min);
        }
        if (metric.normal_max) {
          metric.normal_max = parseFloat(metric.normal_max);
        }
      }

      return metric;
    })
  );
}

module.exports = {
  getAllMetrics,
  getMetricsBySystem,
  getMetricHistory,
  updateMetric,
  deleteMetric,
  getKeyMetrics,
  getOutliers
};
