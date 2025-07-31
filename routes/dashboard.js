const express = require('express');
const healthSystemsService = require('../services/healthSystems');

const router = express.Router();

// Get main dashboard with 13 system tiles
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const dashboard = await healthSystemsService.getSystemDashboard(userId);
    
    // Get recent activity summary
    const recentUploadsResult = await req.db.query(`
      SELECT COUNT(*) as count
      FROM uploads
      WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    `, [userId]);

    const recentMetricsResult = await req.db.query(`
      SELECT COUNT(*) as count
      FROM metrics
      WHERE user_id = $1 AND test_date >= CURRENT_DATE - INTERVAL '30 days'
    `, [userId]);

    // Get latest daily plan
    const dailyPlanResult = await req.db.query(`
      SELECT response, created_at
      FROM ai_outputs_log
      WHERE user_id = $1 AND output_type = 'daily_plan'
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    let dailyPlan = null;
    if (dailyPlanResult.rows.length > 0) {
      try {
        dailyPlan = {
          ...JSON.parse(dailyPlanResult.rows[0].response),
          generated_at: dailyPlanResult.rows[0].created_at
        };
      } catch (parseError) {
        console.error('Error parsing daily plan:', parseError);
      }
    }

    res.json({
      dashboard,
      summary: {
        total_systems: dashboard.length,
        systems_with_data: dashboard.filter(s => s.totalMetricsCount > 0).length,
        green_systems: dashboard.filter(s => s.color === 'green').length,
        yellow_systems: dashboard.filter(s => s.color === 'yellow').length,
        red_systems: dashboard.filter(s => s.color === 'red').length,
        gray_systems: dashboard.filter(s => s.color === 'gray').length,
        recent_uploads: parseInt(recentUploadsResult.rows[0].count),
        recent_metrics: parseInt(recentMetricsResult.rows[0].count)
      },
      daily_plan: dailyPlan
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      error: 'Failed to load dashboard',
      message: error.message 
    });
  }
});

// Get daily plan
router.get('/daily-plan', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await req.db.query(`
      SELECT response, created_at
      FROM ai_outputs_log
      WHERE user_id = $1 AND output_type = 'daily_plan'
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json({
        daily_plan: null,
        message: 'No daily plan generated yet. Upload some health data to get started!'
      });
    }

    try {
      const dailyPlan = JSON.parse(result.rows[0].response);
      res.json({
        daily_plan: {
          ...dailyPlan,
          generated_at: result.rows[0].created_at
        }
      });
    } catch (parseError) {
      console.error('Error parsing daily plan:', parseError);
      res.status(500).json({ 
        error: 'Error loading daily plan',
        message: 'Plan data is corrupted' 
      });
    }

  } catch (error) {
    console.error('Get daily plan error:', error);
    res.status(500).json({ 
      error: 'Failed to load daily plan',
      message: error.message 
    });
  }
});

// Get historical daily plans
router.get('/daily-plans/history', async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 10;

    const result = await req.db.query(`
      SELECT response, created_at
      FROM ai_outputs_log
      WHERE user_id = $1 AND output_type = 'daily_plan'
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    const plans = result.rows.map(row => {
      try {
        return {
          ...JSON.parse(row.response),
          generated_at: row.created_at
        };
      } catch (parseError) {
        return {
          error: 'Failed to parse plan',
          generated_at: row.created_at
        };
      }
    });

    res.json({
      daily_plans: plans,
      count: plans.length
    });

  } catch (error) {
    console.error('Get daily plans history error:', error);
    res.status(500).json({ 
      error: 'Failed to load daily plans history',
      message: error.message 
    });
  }
});

// Force regenerate daily plan
router.post('/daily-plan/regenerate', async (req, res) => {
  try {
    const userId = req.user.userId;
    const queueService = require('../services/queue');
    
    // Queue new daily plan generation
    await queueService.addJob('generate-daily-plan', { userId });

    res.json({
      success: true,
      message: 'Daily plan regeneration queued. Check back in a few minutes.'
    });

  } catch (error) {
    console.error('Regenerate daily plan error:', error);
    res.status(500).json({ 
      error: 'Failed to queue daily plan regeneration',
      message: error.message 
    });
  }
});

// Get system insights
router.get('/insights/:systemId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const systemId = req.params.systemId;

    console.log(`[FRONTEND INSIGHTS REQUEST] userId=${userId} systemId=${systemId}`);

    // Get system name
    const systemResult = await req.db.query(`
      SELECT name FROM health_systems WHERE id = $1
    `, [systemId]);

    if (systemResult.rows.length === 0) {
      console.log(`[SYSTEM NOT FOUND] systemId=${systemId}`);
      return res.status(404).json({ error: 'System not found' });
    }

    const systemName = systemResult.rows[0].name;
    console.log(`[SYSTEM IDENTIFIED] systemId=${systemId} systemName=${systemName}`);

    // Get cached insights using system_id (with fallback to prompt parsing)
    let insightsResult = await req.db.query(`
      SELECT response, created_at
      FROM ai_outputs_log
      WHERE user_id = $1 AND output_type = $2 AND system_id = $3
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, 'system_insights', systemId]);
    
    // Feature flag: Fallback to prompt parsing if system_id lookup fails
    if (insightsResult.rows.length === 0) {
      console.log(`[FALLBACK] system_id lookup failed for userId=${userId} systemId=${systemId}, trying prompt parsing`);
      insightsResult = await req.db.query(`
        SELECT response, created_at
        FROM ai_outputs_log
        WHERE user_id = $1 AND output_type = $2 AND prompt = $3
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId, 'system_insights', `system_id:${systemId}`]);
    }

    console.log(`[INSIGHTS QUERY RESULT] userId=${userId} system=${systemName} cachedInsightsFound=${insightsResult.rows.length > 0}`);

    if (insightsResult.rows.length === 0) {
      console.log(`[NO INSIGHTS CACHED] userId=${userId} system=${systemName}`);
      return res.json({
        insights: null,
        message: 'No insights available yet. Upload health data related to this system.'
      });
    }

    try {
      const insights = JSON.parse(insightsResult.rows[0].response);
      console.log(`[INSIGHTS FOUND] userId=${userId} system=${systemName} generatedAt=${insightsResult.rows[0].created_at}`);
      console.log(`[INSIGHTS CONTENT]`, JSON.stringify(insights, null, 2));
      
      const result = {
        insights: {
          ...insights,
          generated_at: insightsResult.rows[0].created_at
        }
      };
      
      console.log(
        "[FRONTEND FETCH] userId=",
        userId,
        "systemId=",
        systemId,
        "returningInsights=",
        JSON.stringify(result).slice(0, 500)
      );
      
      res.json(result);
    } catch (parseError) {
      console.error('[INSIGHTS PARSE ERROR]', parseError);
      res.status(500).json({ 
        error: 'Error loading insights',
        message: 'Insights data is corrupted' 
      });
    }

  } catch (error) {
    console.error('Get system insights error:', error);
    res.status(500).json({ 
      error: 'Failed to load system insights',
      message: error.message 
    });
  }
});

// Get activity feed
router.get('/activity', async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 20;

    // Get recent uploads
    const uploadsResult = await req.db.query(`
      SELECT 'upload' as type, filename as title, processing_status as status, 
             created_at, processed_at
      FROM uploads
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    // Get recent metrics added
    const metricsResult = await req.db.query(`
      SELECT 'metric' as type, 
             CONCAT(metric_name, ' - ', metric_value, ' ', COALESCE(metric_unit, '')) as title,
             'completed' as status, created_at, created_at as processed_at
      FROM metrics
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    // Get recent AI outputs
    const aiResult = await req.db.query(`
      SELECT 'ai_output' as type, 
             CASE 
               WHEN output_type = 'daily_plan' THEN 'Daily plan generated'
               WHEN output_type LIKE 'system_insights_%' THEN CONCAT('Insights for ', REPLACE(output_type, 'system_insights_', ''))
               ELSE CONCAT('AI analysis: ', output_type)
             END as title,
             'completed' as status, created_at, created_at as processed_at
      FROM ai_outputs_log
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    // Combine and sort all activities
    const allActivities = [
      ...uploadsResult.rows,
      ...metricsResult.rows,
      ...aiResult.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
     .slice(0, limit);

    res.json({
      activities: allActivities,
      count: allActivities.length
    });

  } catch (error) {
    console.error('Get activity feed error:', error);
    res.status(500).json({ 
      error: 'Failed to load activity feed',
      message: error.message 
    });
  }
});

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get comprehensive stats
    const [
      totalMetricsResult,
      totalUploadsResult,
      systemsWithDataResult,
      recentActivityResult,
      keyMetricsResult
    ] = await Promise.all([
      req.db.query('SELECT COUNT(*) FROM metrics WHERE user_id = $1', [userId]),
      req.db.query('SELECT COUNT(*) FROM uploads WHERE user_id = $1', [userId]),
      req.db.query('SELECT COUNT(DISTINCT system_id) FROM metrics WHERE user_id = $1', [userId]),
      req.db.query(`
        SELECT COUNT(*) FROM uploads 
        WHERE user_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      `, [userId]),
      req.db.query(`
        SELECT COUNT(*) FROM metrics 
        WHERE user_id = $1 AND is_key_metric = true
      `, [userId])
    ]);

    // Get metrics by system
    const systemBreakdownResult = await req.db.query(`
      SELECT hs.name, COUNT(m.id) as metric_count
      FROM health_systems hs
      LEFT JOIN metrics m ON hs.id = m.system_id AND m.user_id = $1
      GROUP BY hs.id, hs.name
      ORDER BY metric_count DESC
    `, [userId]);

    res.json({
      stats: {
        total_metrics: parseInt(totalMetricsResult.rows[0].count),
        total_uploads: parseInt(totalUploadsResult.rows[0].count),
        systems_with_data: parseInt(systemsWithDataResult.rows[0].count),
        recent_activity: parseInt(recentActivityResult.rows[0].count),
        key_metrics: parseInt(keyMetricsResult.rows[0].count)
      },
      system_breakdown: systemBreakdownResult.rows
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ 
      error: 'Failed to load dashboard stats',
      message: error.message 
    });
  }
});

module.exports = router;
