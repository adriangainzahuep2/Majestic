const express = require('express');
const healthSystemsService = require('../services/healthSystems');
const insightsRefreshService = require('../services/insightsRefresh');

const router = express.Router();

// Get all metrics for user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { system_id, metric_name, start_date, end_date, key_metrics_only } = req.query;

    let query = `
      SELECT m.*, hs.name as system_name, u.filename, u.created_at as upload_date
      FROM metrics m
      JOIN health_systems hs ON m.system_id = hs.id
      LEFT JOIN uploads u ON m.upload_id = u.id
      WHERE m.user_id = $1
    `;
    
    const params = [userId];
    let paramCount = 2;

    // Add filters
    if (system_id) {
      query += ` AND m.system_id = $${paramCount}`;
      params.push(system_id);
      paramCount++;
    }

    if (metric_name) {
      query += ` AND m.metric_name ILIKE $${paramCount}`;
      params.push(`%${metric_name}%`);
      paramCount++;
    }

    if (start_date) {
      query += ` AND m.test_date >= $${paramCount}`;
      params.push(start_date);
      paramCount++;
    }

    if (end_date) {
      query += ` AND m.test_date <= $${paramCount}`;
      params.push(end_date);
      paramCount++;
    }

    if (key_metrics_only === 'true') {
      query += ` AND m.is_key_metric = true`;
    }

    query += ` ORDER BY m.test_date DESC, m.system_id, m.metric_name`;

    const result = await req.db.query(query, params);

    res.json({
      metrics: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metrics',
      message: error.message 
    });
  }
});

// Get metrics for specific system
router.get('/system/:systemId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const systemId = req.params.systemId;

    const systemDetails = await healthSystemsService.getSystemDetails(userId, systemId);
    res.json(systemDetails);

  } catch (error) {
    console.error('Get system metrics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch system metrics',
      message: error.message 
    });
  }
});

// GET /metrics/types - Get available metric types for dropdown (NEW ENDPOINT)
router.get('/types', async (req, res) => {
  try {
    const userId = req.user.userId;
    const systemId = req.query.systemId;

    if (!systemId) {
      return res.status(400).json({ error: 'systemId parameter is required' });
    }

    // 1. Get official metric names from unified catalog
    const catalog = require('../shared/metricsCatalog');
    let officialMetricNames = [];
    try {
      const systemResult = await req.db.query('SELECT name FROM health_systems WHERE id = $1', [systemId]);
      if (systemResult.rows.length > 0) {
        const systemName = systemResult.rows[0].name;
        officialMetricNames = await catalog.getOfficialNamesBySystem(systemName);
      }
    } catch (error) {
      console.warn('Could not load reference metrics:', error.message);
    }

    // 2. Get approved custom metric names (source_type='official')
    const approvedCustomResult = await req.db.query(`
      SELECT DISTINCT metric_name 
      FROM user_custom_metrics 
      WHERE system_id = $1 AND source_type = 'official' AND review_status = 'approved'
      ORDER BY metric_name
    `, [systemId]);
    const approvedCustomMetricNames = approvedCustomResult.rows.map(row => row.metric_name);

    // 3. Get current user's own pending metric names
    const userPendingResult = await req.db.query(`
      SELECT DISTINCT metric_name 
      FROM user_custom_metrics 
      WHERE system_id = $1 AND user_id = $2 AND source_type = 'user' AND review_status = 'pending'
      ORDER BY metric_name
    `, [systemId, userId]);
    const userPendingMetricNames = userPendingResult.rows.map(row => row.metric_name);

    res.json({
      officialMetricNames,
      approvedCustomMetricNames,
      userPendingMetricNames
    });

  } catch (error) {
    console.error('Get metric types error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metric types',
      message: error.message 
    });
  }
});

// New Trend Analysis API - Get trends for key metrics by system
router.get('/system/:systemId/trends', async (req, res) => {
  try {
    const userId = req.user.userId;
    const systemId = req.params.systemId;

    const trendsData = await healthSystemsService.getSystemTrends(userId, systemId);
    res.json(trendsData);

  } catch (error) {
    console.error('Get system trends error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch system trends',
      message: error.message 
    });
  }
});

// Legacy trend endpoint (keeping for backward compatibility)
router.get('/trends', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { metrics } = req.query;

    if (!metrics) {
      return res.status(400).json({ 
        error: 'Metrics parameter is required',
        message: 'Provide comma-separated metric names' 
      });
    }

    const metricNames = metrics.split(',').map(m => m.trim());
    
    // Limit to supported trend metrics
    const supportedTrends = ['LDL', 'LDL-C', 'ApoB', 'CRP', 'hs-CRP', 'IL-6'];
    const validMetrics = metricNames.filter(name => 
      supportedTrends.some(trend => 
        name.toLowerCase().includes(trend.toLowerCase())
      )
    );

    if (validMetrics.length === 0) {
      return res.status(400).json({ 
        error: 'No supported trend metrics provided',
        supported: supportedTrends
      });
    }

    const trendData = await healthSystemsService.getTrendData(userId, validMetrics);
    
    res.json({
      trends: trendData,
      supported_metrics: supportedTrends
    });

  } catch (error) {
    console.error('Get trend data error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch trend data',
      message: error.message 
    });
  }
});

// Manual metric entry
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { metrics } = req.body;

    if (!metrics || !Array.isArray(metrics)) {
      return res.status(400).json({ 
        error: 'Invalid request format',
        message: 'Provide metrics as an array' 
      });
    }

    const results = [];

    for (const metric of metrics) {
      const {
        metric_name,
        metric_value,
        metric_unit,
        reference_range,
        test_date,
        category
      } = metric;

      if (!metric_name || metric_value === undefined) {
        results.push({
          metric_name,
          status: 'error',
          error: 'Missing required fields: metric_name, metric_value'
        });
        continue;
      }

      try {
        // Map to health system
        const systemId = healthSystemsService.mapMetricToSystem(metric_name, category);
        const isKeyMetric = healthSystemsService.isKeyMetric(systemId, metric_name);

        // Check for duplicates
        const existingResult = await req.db.query(`
          SELECT id FROM metrics 
          WHERE user_id = $1 AND metric_name = $2 AND test_date = $3
        `, [userId, metric_name, test_date || new Date().toISOString().split('T')[0]]);

        if (existingResult.rows.length > 0) {
          results.push({
            metric_name,
            status: 'skipped',
            message: 'Duplicate metric already exists'
          });
          continue;
        }

        // Insert metric
        const insertResult = await req.db.query(`
          INSERT INTO metrics (user_id, system_id, metric_name, metric_value, 
                             metric_unit, reference_range, is_key_metric, test_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          userId,
          systemId,
          metric_name,
          metric_value,
          metric_unit,
          reference_range,
          isKeyMetric,
          test_date || new Date().toISOString().split('T')[0]
        ]);

        results.push({
          id: insertResult.rows[0].id,
          metric_name,
          status: 'created'
        });

      } catch (metricError) {
        console.error(`Error creating metric ${metric_name}:`, metricError);
        results.push({
          metric_name,
          status: 'error',
          error: metricError.message
        });
      }
    }

    res.json({
      success: true,
      results,
      created: results.filter(r => r.status === 'created').length,
      errors: results.filter(r => r.status === 'error').length
    });

  } catch (error) {
    console.error('Create metrics error:', error);
    res.status(500).json({ 
      error: 'Failed to create metrics',
      message: error.message 
    });
  }
});

// Update metric (ENHANCED WITH CUSTOM METRIC VALIDATION)
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const metricId = req.params.id;
    const updates = req.body;

    // Check if metric belongs to user and get current system_id
    const checkResult = await req.db.query(`
      SELECT id, system_id FROM metrics WHERE id = $1 AND user_id = $2
    `, [metricId, userId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Metric not found' });
    }

    const systemId = checkResult.rows[0].system_id;

    // ENHANCED VALIDATION: If metric_name is being updated, validate it
    if (updates.metric_name) {
      const isValidMetricName = await validateMetricName(updates.metric_name, systemId, userId, req.db);
      if (!isValidMetricName) {
        return res.status(400).json({ 
          error: 'Invalid metric name',
          message: 'Metric name must be an official metric, approved custom metric, or your own pending custom metric'
        });
      }
    }

    const allowedUpdates = ['metric_name', 'metric_value', 'metric_unit', 'reference_range', 'test_date', 'exclude_from_analysis', 'review_reason'];
    const setClause = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        // Special handling for test_date - convert empty string to null
        if (key === 'test_date' && (value === '' || value === undefined)) {
          setClause.push(`${key} = $${paramCount}`);
          values.push(null);
        } else if (key === 'exclude_from_analysis') {
          // Force boolean cast
          setClause.push(`${key} = $${paramCount}`);
          values.push(!!value);
        } else {
          setClause.push(`${key} = $${paramCount}`);
          values.push(value);
        }
        paramCount++;
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(metricId);
    const query = `
      UPDATE metrics 
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    console.log('[METRIC_UPDATE] userId=%s metricId=%s set=%o', userId, metricId, updates);
    const result = await req.db.query(query, values);

    // Trigger insights refresh for the updated metric
    console.log(`[METRIC EDIT COMPLETED] userId=${userId} metricId=${metricId} metricName=${result.rows[0].metric_name} newValue=${result.rows[0].metric_value}`);
    const insightsRefreshService = require('../services/insightsRefresh');
    await insightsRefreshService.processMetricEdit(req.db, userId, metricId, result.rows[0]);

    res.json({
      success: true,
      metric: result.rows[0],
      message: 'Metric updated successfully. AI insights and daily plan will be refreshed.'
    });

  } catch (error) {
    console.error('Update metric error:', error);
    res.status(500).json({ 
      error: 'Failed to update metric',
      message: error.message 
    });
  }
});

// Delete metric
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const metricId = req.params.id;

    const result = await req.db.query(`
      DELETE FROM metrics 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [metricId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Metric not found' });
    }

    res.json({
      success: true,
      message: 'Metric deleted successfully'
    });

  } catch (error) {
    console.error('Delete metric error:', error);
    res.status(500).json({ 
      error: 'Failed to delete metric',
      message: error.message 
    });
  }
});

// Export metrics
router.get('/export/:format', async (req, res) => {
  try {
    const userId = req.user.userId;
    const format = req.params.format.toLowerCase();

    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({ 
        error: 'Invalid export format',
        supported: ['csv', 'json'] 
      });
    }

    // Get all metrics for user
    const result = await req.db.query(`
      SELECT m.*, hs.name as system_name, u.filename as source_file
      FROM metrics m
      JOIN health_systems hs ON m.system_id = hs.id
      LEFT JOIN uploads u ON m.upload_id = u.id
      WHERE m.user_id = $1
      ORDER BY m.test_date DESC, m.system_id, m.metric_name
    `, [userId]);

    const metrics = result.rows;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=health_metrics.json');
      res.json({
        export_date: new Date().toISOString(),
        user_id: userId,
        total_metrics: metrics.length,
        metrics
      });
    } else {
      // CSV format
      const headers = [
        'System', 'Metric Name', 'Value', 'Unit', 'Reference Range',
        'Key Metric', 'Test Date', 'Source File', 'Created Date'
      ];

      const csvRows = [headers.join(',')];
      
      for (const metric of metrics) {
        const row = [
          `"${metric.system_name}"`,
          `"${metric.metric_name}"`,
          metric.metric_value || '',
          `"${metric.metric_unit || ''}"`,
          `"${metric.reference_range || ''}"`,
          metric.is_key_metric ? 'Yes' : 'No',
          metric.test_date || '',
          `"${metric.source_file || ''}"`,
          metric.created_at ? new Date(metric.created_at).toISOString() : ''
        ];
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=health_metrics.csv');
      res.send(csvRows.join('\n'));
    }

  } catch (error) {
    console.error('Export metrics error:', error);
    res.status(500).json({ 
      error: 'Failed to export metrics',
      message: error.message 
    });
  }
});

// Get reference metrics data
router.get('/reference', async (req, res) => {
  try {
    const catalog = require('../shared/metricsCatalog');
    const all = catalog.getAllMetrics();
    res.json(all);
    
  } catch (error) {
    console.error('Get reference metrics error:', error);
    res.status(500).json({
      error: 'Failed to load reference metrics',
      message: error.message
    });
  }
});

// Update specific metric
router.put('/:metricId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const metricId = req.params.metricId;
    const { metric_name, metric_value, metric_unit, test_date, source, reference_range } = req.body;

    // Update the metric including reference_range
    const updateResult = await req.db.query(`
      UPDATE metrics 
      SET metric_name = $1, metric_value = $2, metric_unit = $3, test_date = $4, 
          reference_range = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND user_id = $7
      RETURNING *
    `, [metric_name, metric_value, metric_unit, test_date, reference_range, metricId, userId]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Metric not found or unauthorized'
      });
    }

    const updatedMetric = updateResult.rows[0];

    // Re-map to health system if metric name changed
    if (metric_name !== updatedMetric.metric_name) {
      const systemId = healthSystemsService.mapMetricToSystem(metric_name);
      const isKeyMetric = healthSystemsService.isKeyMetric(systemId, metric_name);
      
      if (systemId) {
        await req.db.query(`
          UPDATE metrics 
          SET system_id = $1, is_key_metric = $2
          WHERE id = $3
        `, [systemId, isKeyMetric, metricId]);
      }
    }

    // Log the edit for future learning
    await req.db.query(`
      INSERT INTO ai_outputs_log (user_id, output_type, prompt, response, model_version)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      userId,
      'metric_edit',
      `User edited metric: ${updatedMetric.metric_name} -> ${metric_name}`,
      JSON.stringify({ original: updatedMetric, updated: req.body }),
      'user_edit'
    ]);

    // Process insights refresh
    await insightsRefreshService.processMetricEdit(req.db, userId, metricId, {
      metric_name,
      metric_value,
      metric_unit,
      test_date
    });

    res.json({
      success: true,
      message: 'Metric updated successfully',
      metric: updatedMetric
    });

  } catch (error) {
    console.error('Update metric error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update metric',
      error: error.message
    });
  }
});

// Helper function to validate metric names (NEW VALIDATION LOGIC)
async function validateMetricName(metricName, systemId, userId, db) {
  try {
    // 1. Check if it's an official metric from reference data
    const fs = require('fs');
    const path = require('path');
    
    try {
      const metricsPath = path.join(__dirname, '../src/data/metrics.json');
      if (fs.existsSync(metricsPath)) {
        const metricsData = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
        const systemResult = await db.query('SELECT name FROM health_systems WHERE id = $1', [systemId]);
        if (systemResult.rows.length > 0) {
          const systemName = systemResult.rows[0].name;
          const isOfficialMetric = metricsData.some(m => 
            m.system === systemName && m.metric === metricName
          );
          if (isOfficialMetric) return true;
        }
      }
    } catch (error) {
      console.warn('Could not load reference metrics for validation:', error.message);
    }

    // 2. Check if it's an approved custom metric (source_type='official')
    const approvedCustomResult = await db.query(`
      SELECT id FROM user_custom_metrics 
      WHERE system_id = $1 AND metric_name = $2 AND source_type = 'official' AND review_status = 'approved'
    `, [systemId, metricName]);
    
    if (approvedCustomResult.rows.length > 0) return true;

    // 3. Check if it's the current user's own pending custom metric
    const userPendingResult = await db.query(`
      SELECT id FROM user_custom_metrics 
      WHERE system_id = $1 AND metric_name = $2 AND user_id = $3 AND source_type = 'user' AND review_status = 'pending'
    `, [systemId, metricName, userId]);
    
    if (userPendingResult.rows.length > 0) return true;

    // If none of the above, it's invalid
    return false;
  } catch (error) {
    console.error('Error validating metric name:', error);
    return false;
  }
}

// POST endpoint to create custom metric type during edit flow (NEW ENDPOINT)
router.post('/create-custom-type', async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      systemId,
      metricName,
      units,
      normalRangeMin,
      normalRangeMax,
      rangeApplicableTo = 'All'
    } = req.body;

    // Validate required fields
    if (!systemId || !metricName || !units) {
      return res.status(400).json({ 
        error: 'systemId, metricName, and units are required' 
      });
    }

    // Check if metric name already exists (avoid duplicates)
    const existingResult = await req.db.query(`
      SELECT id FROM user_custom_metrics 
      WHERE system_id = $1 AND metric_name = $2
    `, [systemId, metricName]);

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Metric name already exists',
        message: 'This metric name is already defined. Please choose a different name.'
      });
    }

    // Create new custom metric type
    const result = await req.db.query(`
      INSERT INTO user_custom_metrics 
      (system_id, user_id, metric_name, value, units, normal_range_min, normal_range_max, range_applicable_to, source_type, review_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'user', 'pending')
      RETURNING *
    `, [systemId, userId, metricName, '0', units, normalRangeMin, normalRangeMax, rangeApplicableTo]);

    console.log(`[CUSTOM METRIC TYPE CREATED] userId=${userId} systemId=${systemId} metricName=${metricName} status=pending`);

    res.status(201).json({
      success: true,
      customMetricType: result.rows[0],
      message: 'Custom metric type created and pending admin review'
    });

  } catch (error) {
    console.error('Error creating custom metric type:', error);
    
    if (error.code === '23514') { // CHECK constraint violation
      return res.status(400).json({ 
        error: 'Invalid value for units or range_applicable_to field' 
      });
    }
    
    res.status(500).json({ error: 'Failed to create custom metric type' });
  }
});

module.exports = router;
