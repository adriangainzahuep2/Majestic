/**
 * Insights API Routes
 */

const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const insightsRefreshService = require('../services/insightsRefresh');

// GET /insights/dashboard - Get AI-generated health insights dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const dashboard = await insightsRefreshService.getDashboardInsights(userId);
    
    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    console.error('[INSIGHTS] Dashboard error:', error);
    res.status(500).json({
      error: 'Failed to get insights dashboard',
      message: error.message
    });
  }
});

// GET /insights/system/:systemId - Get insights for specific health system
router.get('/system/:systemId', [
  query('timeframe').optional().isIn(['7d', '30d', '90d', '1y'])
], async (req, res) => {
  try {
    const userId = req.user.id;
    const systemId = req.params.systemId;
    const { timeframe = '30d' } = req.query;
    
    const insights = await insightsRefreshService.getSystemInsights(userId, systemId, timeframe);
    
    res.json({
      success: true,
      data: insights
    });

  } catch (error) {
    console.error('[INSIGHTS] System insights error:', error);
    res.status(500).json({
      error: 'Failed to get system insights',
      message: error.message
    });
  }
});

// GET /insights/trends - Get trend analysis and predictions
router.get('/trends', [
  query('systems').optional().isString(), // Comma-separated system IDs
  query('metrics').optional().isString(), // Comma-separated metric names
  query('period').optional().isIn(['30d', '90d', '6m', '1y'])
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      systems, 
      metrics, 
      period = '30d' 
    } = req.query;
    
    const trends = await insightsRefreshService.getTrendAnalysis(userId, {
      systems: systems ? systems.split(',').map(s => parseInt(s)) : undefined,
      metrics: metrics ? metrics.split(',') : undefined,
      period
    });
    
    res.json({
      success: true,
      data: trends
    });

  } catch (error) {
    console.error('[INSIGHTS] Trends error:', error);
    res.status(500).json({
      error: 'Failed to get trend analysis',
      message: error.message
    });
  }
});

// POST /insights/refresh - Force refresh insights for user's data
router.post('/refresh', async (req, res) => {
  try {
    const userId = req.user.id;
    const { systems } = req.body; // Optional: specific systems to refresh
    
    const result = await insightsRefreshService.forceRefresh(userId, systems);
    
    res.json({
      success: true,
      data: result,
      message: 'Insights refresh initiated'
    });

  } catch (error) {
    console.error('[INSIGHTS] Refresh error:', error);
    res.status(500).json({
      error: 'Failed to refresh insights',
      message: error.message
    });
  }
});

// GET /insights/recommendations - Get AI-powered health recommendations
router.get('/recommendations', [
  query('category').optional().isIn(['diet', 'exercise', 'supplements', 'lifestyle']),
  query('priority').optional().isIn(['high', 'medium', 'low'])
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, priority } = req.query;
    
    const recommendations = await insightsRefreshService.getRecommendations(userId, {
      category,
      priority
    });
    
    res.json({
      success: true,
      data: recommendations
    });

  } catch (error) {
    console.error('[INSIGHTS] Recommendations error:', error);
    res.status(500).json({
      error: 'Failed to get recommendations',
      message: error.message
    });
  }
});

// GET /insights/risks - Get health risk assessments
router.get('/risks', async (req, res) => {
  try {
    const userId = req.user.id;
    const risks = await insightsRefreshService.getRiskAssessment(userId);
    
    res.json({
      success: true,
      data: risks
    });

  } catch (error) {
    console.error('[INSIGHTS] Risk assessment error:', error);
    res.status(500).json({
      error: 'Failed to get risk assessment',
      message: error.message
    });
  }
});

// GET /insights/goals - Get health goal tracking and progress
router.get('/goals', async (req, res) => {
  try {
    const userId = req.user.id;
    const goals = await insightsRefreshService.getGoalTracking(userId);
    
    res.json({
      success: true,
      data: goals
    });

  } catch (error) {
    console.error('[INSIGHTS] Goals error:', error);
    res.status(500).json({
      error: 'Failed to get goal tracking',
      message: error.message
    });
  }
});

// POST /insights/goals - Set or update health goals
router.post('/goals', async (req, res) => {
  try {
    const userId = req.user.id;
    const { goals } = req.body; // Array of goal objects
    
    const result = await insightsRefreshService.setGoals(userId, goals);
    
    res.json({
      success: true,
      data: result,
      message: 'Health goals updated successfully'
    });

  } catch (error) {
    console.error('[INSIGHTS] Set goals error:', error);
    res.status(500).json({
      error: 'Failed to set goals',
      message: error.message
    });
  }
});

module.exports = router;
