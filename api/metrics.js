/**
 * Metrics API Routes
 */

const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const metricService = require('../services/metricService');

// GET /metrics - Get user's health metrics
router.get('/', [
  query('system').optional().isInt({ min: 1, max: 13 }),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const { system, startDate, endDate, limit } = req.query;
    
    const metrics = await metricService.getUserMetrics(userId, {
      systemId: system,
      startDate,
      endDate,
      limit
    });

    res.json({
      success: true,
      data: metrics,
      summary: {
        total: metrics.length,
        systems: [...new Set(metrics.map(m => m.system))].length,
        dateRange: metrics.length > 0 ? {
          earliest: metrics[metrics.length - 1]?.test_date,
          latest: metrics[0]?.test_date
        } : null
      }
    });

  } catch (error) {
    console.error('[METRICS] Get metrics error:', error);
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error.message
    });
  }
});

// GET /metrics/:id - Get specific metric
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const metricId = req.params.id;
    
    const metric = await metricService.getMetricById(userId, metricId);

    if (!metric) {
      return res.status(404).json({
        error: 'Metric not found'
      });
    }

    res.json({
      success: true,
      data: metric
    });

  } catch (error) {
    console.error('[METRICS] Get metric error:', error);
    res.status(500).json({
      error: 'Failed to get metric',
      message: error.message
    });
  }
});

// POST /metrics - Add new metric (from mobile app uploads)
router.post('/', [
  body('name').isLength({ min: 1 }),
  body('value').isFloat(),
  body('unit').optional().isString(),
  body('testDate').isISO8601(),
  body('category').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const metricData = req.body;
    
    const result = await metricService.addMetric(userId, metricData);

    res.status(201).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[METRICS] Add metric error:', error);
    res.status(500).json({
      error: 'Failed to add metric',
      message: error.message
    });
  }
});

// PUT /metrics/:id - Update metric
router.put('/:id', [
  body('value').isFloat(),
  body('unit').optional().isString(),
  body('testDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.id;
    const metricId = req.params.id;
    const updateData = req.body;
    
    const result = await metricService.updateMetric(userId, metricId, updateData);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[METRICS] Update metric error:', error);
    res.status(500).json({
      error: 'Failed to update metric',
      message: error.message
    });
  }
});

// DELETE /metrics/:id - Delete metric
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const metricId = req.params.id;
    
    await metricService.deleteMetric(userId, metricId);

    res.json({
      success: true,
      message: 'Metric deleted successfully'
    });

  } catch (error) {
    console.error('[METRICS] Delete metric error:', error);
    res.status(500).json({
      error: 'Failed to delete metric',
      message: error.message
    });
  }
});

// GET /metrics/systems - Get all health systems
router.get('/systems', async (req, res) => {
  try {
    const systems = await metricService.getHealthSystems();
    
    res.json({
      success: true,
      data: systems
    });

  } catch (error) {
    console.error('[METRICS] Get systems error:', error);
    res.status(500).json({
      error: 'Failed to get health systems',
      message: error.message
    });
  }
});

// GET /metrics/trends/:systemId - Get trend data for a system
router.get('/trends/:systemId', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']),
  query('metric').optional().isString()
], async (req, res) => {
  try {
    const userId = req.user.id;
    const systemId = req.params.systemId;
    const { period = '30d', metric } = req.query;
    
    const trends = await metricService.getSystemTrends(userId, systemId, {
      period,
      metric
    });

    res.json({
      success: true,
      data: trends
    });

  } catch (error) {
    console.error('[METRICS] Get trends error:', error);
    res.status(500).json({
      error: 'Failed to get trends',
      message: error.message
    });
  }
});

// GET /metrics/suggestions - Get AI suggestions for metric interpretation
router.get('/suggestions', [
  query('metricName').isString(),
  query('value').isFloat(),
  query('unit').optional().isString()
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { metricName, value, unit } = req.query;
    
    const suggestions = await metricService.getMetricSuggestions(userId, {
      metricName,
      value,
      unit
    });

    res.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    console.error('[METRICS] Get suggestions error:', error);
    res.status(500).json({
      error: 'Failed to get suggestions',
      message: error.message
    });
  }
});

module.exports = router;
