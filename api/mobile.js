/**
 * Mobile Data Integration API Routes
 * Pulls data from mobile app and provides AI-powered insights
 */

const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const mobileIntegrationService = require('../services/mobileIntegrationService');
const aiVisualizationService = require('../services/aiVisualizationService');

// POST /mobile/sync - Sync data from mobile app
router.post('/sync', [
  body('deviceId').isString().isLength({ min: 10 }),
  body('data').isArray(),
  body('timestamp').isISO8601(),
  body('data.*.type').isIn(['metric', 'activity', 'symptom', 'medication']),
  body('data.*.value').exists(),
  body('data.*.timestamp').isISO8601()
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
    const { deviceId, data, timestamp } = req.body;
    
    const result = await mobileIntegrationService.syncMobileData(userId, {
      deviceId,
      data,
      timestamp
    });

    res.json({
      success: true,
      data: result,
      message: 'Mobile data synced successfully'
    });

  } catch (error) {
    console.error('[MOBILE] Sync error:', error);
    res.status(500).json({
      error: 'Mobile sync failed',
      message: error.message
    });
  }
});

// GET /mobile/data - Retrieve mobile app data with AI analysis
router.get('/data', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('dataTypes').optional().isString(), // Comma-separated
  query('includeAnalysis').optional().isBoolean()
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, dataTypes, includeAnalysis = true } = req.query;
    
    const data = await mobileIntegrationService.getMobileData(userId, {
      startDate,
      endDate,
      dataTypes: dataTypes ? dataTypes.split(',') : undefined
    });

    let analysis = null;
    if (includeAnalysis) {
      analysis = await aiVisualizationService.analyzeMobileData(userId, data);
    }
    
    res.json({
      success: true,
      data: {
        rawData: data,
        analysis
      },
      summary: {
        totalRecords: data.length,
        dateRange: data.length > 0 ? {
          start: data[data.length - 1]?.timestamp,
          end: data[0]?.timestamp
        } : null,
        dataTypes: [...new Set(data.map(d => d.type))]
      }
    });

  } catch (error) {
    console.error('[MOBILE] Get data error:', error);
    res.status(500).json({
      error: 'Failed to get mobile data',
      message: error.message
    });
  }
});

// POST /mobile/visualization - Generate AI-powered visualizations
router.post('/visualization', [
  body('chartType').isIn(['line', 'bar', 'heatmap', 'radar', 'scatter', 'candlestick']),
  body('data').isArray(),
  body('timeRange').isIn(['7d', '30d', '90d', '1y', 'custom']),
  body('metrics').optional().isArray(),
  body('filters').optional().isObject()
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
    const { chartType, data, timeRange, metrics, filters } = req.body;
    
    const visualization = await aiVisualizationService.generateVisualization(userId, {
      chartType,
      data,
      timeRange,
      metrics,
      filters
    });

    res.json({
      success: true,
      data: visualization
    });

  } catch (error) {
    console.error('[MOBILE] Visualization error:', error);
    res.status(500).json({
      error: 'Failed to generate visualization',
      message: error.message
    });
  }
});

// GET /mobile/dashboard - AI-powered mobile health dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const dashboard = await aiVisualizationService.generateDashboard(userId);
    
    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    console.error('[MOBILE] Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to generate dashboard',
      message: error.message
    });
  }
});

// POST /mobile/insights - Generate AI insights from mobile data
router.post('/insights', [
  body('dataTypes').isArray(),
  body('timeRange').isIn(['7d', '30d', '90d', '1y']),
  body('focus').optional().isIn(['trends', 'anomalies', 'patterns', 'predictions'])
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
    const { dataTypes, timeRange, focus = 'trends' } = req.body;
    
    const insights = await aiVisualizationService.generateInsights(userId, {
      dataTypes,
      timeRange,
      focus
    });

    res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('[MOBILE] Insights error:', error);
    res.status(500).json({
      error: 'Failed to generate insights',
      message: error.message
    });
  }
});

// GET /mobile/predictions - AI health predictions based on mobile data
router.get('/predictions', [
  query('timeframe').optional().isIn(['7d', '30d', '90d', '6m']),
  query('metrics').optional().isString() // Comma-separated
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeframe = '30d', metrics } = req.query;
    
    const predictions = await aiVisualizationService.generatePredictions(userId, {
      timeframe,
      metrics: metrics ? metrics.split(',') : undefined
    });
    
    res.json({
      success: true,
      data: predictions
    });

  } catch (error) {
    console.error('[MOBILE] Predictions error:', error);
    res.status(500).json({
      error: 'Failed to generate predictions',
      message: error.message
    });
  }
});

// POST /mobile/anomaly-detection - Detect anomalies in mobile data
router.post('/anomaly-detection', [
  body('data').isArray(),
  body('sensitivity').optional().isFloat({ min: 0.1, max: 1.0 }),
  body('metrics').optional().isArray()
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
    const { data, sensitivity = 0.8, metrics } = req.body;
    
    const anomalies = await aiVisualizationService.detectAnomalies(userId, {
      data,
      sensitivity,
      metrics
    });
    
    res.json({
      success: true,
      data: anomalies
    });

  } catch (error) {
    console.error('[MOBILE] Anomaly detection error:', error);
    res.status(500).json({
      error: 'Failed to detect anomalies',
      message: error.message
    });
  }
});

// GET /mobile/comparisons - Compare user's data with population norms
router.get('/comparisons', [
  query('metrics').optional().isString(),
  query('timeframe').optional().isIn(['7d', '30d', '90d']),
  query('demographics').optional().isIn(['age', 'gender', 'activity_level'])
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { metrics, timeframe = '30d', demographics = 'age' } = req.query;
    
    const comparisons = await aiVisualizationService.generateComparisons(userId, {
      metrics: metrics ? metrics.split(',') : undefined,
      timeframe,
      demographics
    });
    
    res.json({
      success: true,
      data: comparisons
    });

  } catch (error) {
    console.error('[MOBILE] Comparisons error:', error);
    res.status(500).json({
      error: 'Failed to generate comparisons',
      message: error.message
    });
  }
});

module.exports = router;
