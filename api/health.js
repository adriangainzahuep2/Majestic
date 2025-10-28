/**
 * Health System API Routes
 */

const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const healthSystemsService = require('../services/healthSystems');

// GET /health/systems - Get all health systems
router.get('/systems', async (req, res) => {
  try {
    const systems = await healthSystemsService.getAllSystems();
    
    res.json({
      success: true,
      data: systems
    });

  } catch (error) {
    console.error('[HEALTH] Get systems error:', error);
    res.status(500).json({
      error: 'Failed to get health systems',
      message: error.message
    });
  }
});

// GET /health/systems/:id - Get specific health system
router.get('/systems/:id', async (req, res) => {
  try {
    const systemId = req.params.id;
    const system = await healthSystemsService.getSystemById(systemId);

    if (!system) {
      return res.status(404).json({
        error: 'Health system not found'
      });
    }

    res.json({
      success: true,
      data: system
    });

  } catch (error) {
    console.error('[HEALTH] Get system error:', error);
    res.status(500).json({
      error: 'Failed to get health system',
      message: error.message
    });
  }
});

// GET /health/systems/:id/insights - Get AI insights for a health system
router.get('/systems/:id/insights', [
  query('timeframe').optional().isIn(['7d', '30d', '90d', '1y'])
], async (req, res) => {
  try {
    const userId = req.user.id;
    const systemId = req.params.id;
    const { timeframe = '30d' } = req.query;
    
    const insights = await healthSystemsService.getSystemInsights(userId, systemId, timeframe);

    res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('[HEALTH] Get insights error:', error);
    res.status(500).json({
      error: 'Failed to get insights',
      message: error.message
    });
  }
});

// GET /health/dashboard - Get overall health dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const dashboard = await healthSystemsService.getHealthDashboard(userId);
    
    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    console.error('[HEALTH] Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get health dashboard',
      message: error.message
    });
  }
});

// GET /health/summary - Get health summary with key metrics
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const summary = await healthSystemsService.getHealthSummary(userId);
    
    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('[HEALTH] Summary error:', error);
    res.status(500).json({
      error: 'Failed to get health summary',
      message: error.message
    });
  }
});

// POST /health/insights/refresh - Refresh AI insights for user's data
router.post('/insights/refresh', async (req, res) => {
  try {
    const userId = req.user.id;
    const { systems } = req.body; // Optional: specific systems to refresh
    
    const result = await healthSystemsService.refreshInsights(userId, systems);
    
    res.json({
      success: true,
      data: result,
      message: 'Insights refresh initiated'
    });

  } catch (error) {
    console.error('[HEALTH] Insights refresh error:', error);
    res.status(500).json({
      error: 'Failed to refresh insights',
      message: error.message
    });
  }
});

// GET /health/trends - Get cross-system health trends
router.get('/trends', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y']),
  query('metrics').optional().isString() // Comma-separated list of metrics
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = '30d', metrics } = req.query;
    
    const trends = await healthSystemsService.getCrossSystemTrends(userId, {
      period,
      metrics: metrics ? metrics.split(',') : undefined
    });
    
    res.json({
      success: true,
      data: trends
    });

  } catch (error) {
    console.error('[HEALTH] Trends error:', error);
    res.status(500).json({
      error: 'Failed to get health trends',
      message: error.message
    });
  }
});

module.exports = router;
