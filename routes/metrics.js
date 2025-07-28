const express = require('express');
const healthSystemsService = require('../services/healthSystems');

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

// Get trend data for specific metrics
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

// Update metric
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const metricId = req.params.id;
    const updates = req.body;

    // Check if metric belongs to user
    const checkResult = await req.db.query(`
      SELECT id FROM metrics WHERE id = $1 AND user_id = $2
    `, [metricId, userId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Metric not found' });
    }

    const allowedUpdates = ['metric_value', 'metric_unit', 'reference_range', 'test_date'];
    const setClause = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        setClause.push(`${key} = $${paramCount}`);
        values.push(value);
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

    const result = await req.db.query(query, values);

    res.json({
      success: true,
      metric: result.rows[0]
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

module.exports = router;
