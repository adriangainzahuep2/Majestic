const openaiService = require('../services/openaiService');
const { HEALTH_SYSTEMS } = require('../database/schema');

/**
 * Dashboard Controller
 * Provides dashboard data, insights, and analytics
 */

/**
 * Get dashboard overview
 */
async function getDashboardOverview(req, res) {
  try {
    const userId = req.user.id;

    // Get system summaries
    const systemsResult = await req.db.query(`
      SELECT 
        hs.id,
        hs.name,
        hs.description,
        COUNT(DISTINCT m.id) as total_metrics,
        COUNT(DISTINCT CASE WHEN m.is_outlier = true THEN m.id END) as outlier_count,
        MAX(m.test_date) as latest_test_date
      FROM health_systems hs
      LEFT JOIN metrics m ON hs.id = m.system_id AND m.user_id = $1
      GROUP BY hs.id, hs.name, hs.description
      ORDER BY hs.id
    `, [userId]);

    // Get recent uploads
    const recentUploadsResult = await req.db.query(`
      SELECT 
        u.*,
        COUNT(m.id) as metrics_count
      FROM uploads u
      LEFT JOIN metrics m ON u.id = m.upload_id
      WHERE u.user_id = $1
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 5
    `, [userId]);

    // Get key findings count
    const keyFindingsResult = await req.db.query(`
      SELECT COUNT(*) as count
      FROM ai_outputs_log
      WHERE user_id = $1 
        AND output_type = 'key_findings'
        AND is_current = true
    `, [userId]);

    // Get outlier metrics
    const outliersResult = await req.db.query(`
      SELECT 
        m.*,
        hs.name as system_name
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.user_id = $1 AND m.is_outlier = true
      ORDER BY m.test_date DESC
      LIMIT 10
    `, [userId]);

    res.json({
      success: true,
      data: {
        systems: systemsResult.rows,
        recentUploads: recentUploadsResult.rows,
        keyFindingsCount: parseInt(keyFindingsResult.rows[0].count),
        outliers: outliersResult.rows,
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard overview',
      message: error.message
    });
  }
}

/**
 * Get system details for dashboard
 */
async function getSystemDetails(req, res) {
  try {
    const userId = req.user.id;
    const { systemId } = req.params;

    // Get system info
    const systemResult = await req.db.query(
      'SELECT * FROM health_systems WHERE id = $1',
      [systemId]
    );

    if (systemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'System not found'
      });
    }

    const system = systemResult.rows[0];

    // Get metrics for this system
    const metricsResult = await req.db.query(`
      SELECT 
        m.*,
        u.filename as source_file,
        u.created_at as upload_date
      FROM metrics m
      LEFT JOIN uploads u ON m.upload_id = u.id
      WHERE m.user_id = $1 AND m.system_id = $2
      ORDER BY m.test_date DESC, m.metric_name
    `, [userId, systemId]);

    // Get AI insights for this system
    const insightsResult = await req.db.query(`
      SELECT *
      FROM ai_outputs_log
      WHERE user_id = $1 
        AND system_id = $2
        AND output_type IN ('key_findings', 'daily_plan')
        AND is_current = true
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, systemId]);

    res.json({
      success: true,
      data: {
        system: system,
        metrics: metricsResult.rows,
        metricsCount: metricsResult.rows.length,
        insights: insightsResult.rows[0] || null
      }
    });

  } catch (error) {
    console.error('Get system details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system details',
      message: error.message
    });
  }
}

/**
 * Get key findings (AI-generated insights)
 */
async function getKeyFindings(req, res) {
  try {
    const userId = req.user.id;
    const { systemId, regenerate } = req.query;

    // Check if we have recent key findings
    let findingsResult = null;

    if (!regenerate) {
      let query = `
        SELECT *
        FROM ai_outputs_log
        WHERE user_id = $1 
          AND output_type = 'key_findings'
          AND is_current = true
      `;
      
      const params = [userId];

      if (systemId) {
        query += ` AND system_id = $2`;
        params.push(systemId);
      }

      query += ` ORDER BY created_at DESC LIMIT 1`;

      findingsResult = await req.db.query(query, params);
    }

    // Generate new findings if none exist or regenerate requested
    if (!findingsResult || findingsResult.rows.length === 0 || regenerate) {
      const findings = await generateKeyFindings(req.db, userId, systemId);
      
      return res.json({
        success: true,
        data: findings,
        generated: true
      });
    }

    res.json({
      success: true,
      data: findingsResult.rows[0],
      generated: false
    });

  } catch (error) {
    console.error('Get key findings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve key findings',
      message: error.message
    });
  }
}

/**
 * Generate key findings using AI
 */
async function generateKeyFindings(db, userId, systemId = null) {
  try {
    console.log('[Key Findings] Generating for user', userId, 'system', systemId);

    // Get recent metrics
    let query = `
      SELECT 
        m.*,
        hs.name as system_name
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.user_id = $1
    `;

    const params = [userId];

    if (systemId) {
      query += ` AND m.system_id = $2`;
      params.push(systemId);
    }

    query += ` ORDER BY m.test_date DESC, m.is_outlier DESC LIMIT 100`;

    const metricsResult = await db.query(query, params);

    if (metricsResult.rows.length === 0) {
      throw new Error('No metrics available to analyze');
    }

    // Prepare data for AI
    const metricsData = metricsResult.rows.map(m => ({
      system: m.system_name,
      metric: m.metric_name,
      value: m.metric_value,
      unit: m.metric_unit,
      range: m.reference_range,
      date: m.test_date,
      isOutlier: m.is_outlier
    }));

    const prompt = `Analyze these health metrics and provide key findings:
    
    Metrics:
    ${JSON.stringify(metricsData, null, 2)}
    
    Provide:
    1. Top 3-5 most important findings
    2. Any concerning trends or outliers
    3. Positive health indicators
    4. Recommendations for follow-up
    
    Format as JSON with: { findings: [], concerns: [], positives: [], recommendations: [] }`;

    const startTime = Date.now();
    const aiResponse = await openaiService.generateCompletion(prompt);
    const processingTime = Date.now() - startTime;

    // Parse AI response
    const analysis = JSON.parse(aiResponse);

    // Mark previous findings as not current
    await db.query(`
      UPDATE ai_outputs_log
      SET is_current = false
      WHERE user_id = $1 
        AND output_type = 'key_findings'
        ${systemId ? 'AND system_id = $2' : ''}
    `, systemId ? [userId, systemId] : [userId]);

    // Store new findings
    const result = await db.query(`
      INSERT INTO ai_outputs_log (
        user_id,
        system_id,
        output_type,
        prompt,
        response,
        model_version,
        processing_time_ms,
        is_current
      ) VALUES ($1, $2, 'key_findings', $3, $4, 'gpt-4o', $5, true)
      RETURNING *
    `, [
      userId,
      systemId || null,
      prompt,
      JSON.stringify(analysis),
      processingTime
    ]);

    return result.rows[0];

  } catch (error) {
    console.error('Generate key findings error:', error);
    throw error;
  }
}

/**
 * Get daily plan
 */
async function getDailyPlan(req, res) {
  try {
    const userId = req.user.id;
    const { regenerate } = req.query;

    // Check for existing plan
    let planResult = null;

    if (!regenerate) {
      planResult = await req.db.query(`
        SELECT *
        FROM ai_outputs_log
        WHERE user_id = $1 
          AND output_type = 'daily_plan'
          AND is_current = true
          AND DATE(created_at) = CURRENT_DATE
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId]);
    }

    // Generate new plan if needed
    if (!planResult || planResult.rows.length === 0 || regenerate) {
      const plan = await generateDailyPlan(req.db, userId);
      
      return res.json({
        success: true,
        data: plan,
        generated: true
      });
    }

    res.json({
      success: true,
      data: planResult.rows[0],
      generated: false
    });

  } catch (error) {
    console.error('Get daily plan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve daily plan',
      message: error.message
    });
  }
}

/**
 * Generate daily plan using AI
 */
async function generateDailyPlan(db, userId) {
  try {
    console.log('[Daily Plan] Generating for user', userId);

    // Get user profile
    const userResult = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];

    // Get recent outliers and key metrics
    const metricsResult = await db.query(`
      SELECT 
        m.*,
        hs.name as system_name
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.user_id = $1
        AND (m.is_outlier = true OR m.is_key_metric = true)
      ORDER BY m.test_date DESC
      LIMIT 50
    `, [userId]);

    // Get recent key findings
    const findingsResult = await db.query(`
      SELECT response
      FROM ai_outputs_log
      WHERE user_id = $1 
        AND output_type = 'key_findings'
        AND is_current = true
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    const keyFindings = findingsResult.rows[0]?.response || '{}';

    const prompt = `Create a personalized daily action plan based on:
    
    User Profile:
    - Sex: ${user.sex || 'Not specified'}
    - Age: ${user.date_of_birth ? calculateAge(user.date_of_birth) : 'Not specified'}
    
    Recent Key Findings:
    ${keyFindings}
    
    Recent Metrics (outliers and key):
    ${JSON.stringify(metricsResult.rows.slice(0, 20), null, 2)}
    
    Provide a daily plan with:
    1. Morning routine (diet, supplements, activities)
    2. Throughout the day (exercise, habits, monitoring)
    3. Evening routine (sleep, recovery)
    4. Specific actions to address outliers
    
    Format as JSON with: { morning: [], day: [], evening: [], priorities: [] }`;

    const startTime = Date.now();
    const aiResponse = await openaiService.generateCompletion(prompt);
    const processingTime = Date.now() - startTime;

    const plan = JSON.parse(aiResponse);

    // Mark previous plans as not current
    await db.query(`
      UPDATE ai_outputs_log
      SET is_current = false
      WHERE user_id = $1 AND output_type = 'daily_plan'
    `, [userId]);

    // Store new plan
    const result = await db.query(`
      INSERT INTO ai_outputs_log (
        user_id,
        output_type,
        prompt,
        response,
        model_version,
        processing_time_ms,
        is_current
      ) VALUES ($1, 'daily_plan', $2, $3, 'gpt-4o', $4, true)
      RETURNING *
    `, [
      userId,
      prompt,
      JSON.stringify(plan),
      processingTime
    ]);

    return result.rows[0];

  } catch (error) {
    console.error('Generate daily plan error:', error);
    throw error;
  }
}

/**
 * Helper: Calculate age from date of birth
 */
function calculateAge(dob) {
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Get metrics trends
 */
async function getMetricsTrends(req, res) {
  try {
    const userId = req.user.id;
    const { metricName, startDate, endDate } = req.query;

    if (!metricName) {
      return res.status(400).json({
        success: false,
        error: 'metricName is required'
      });
    }

    let query = `
      SELECT 
        test_date,
        metric_value,
        metric_unit,
        reference_range
      FROM metrics
      WHERE user_id = $1 AND metric_name = $2
    `;

    const params = [userId, metricName];
    let paramCount = 2;

    if (startDate) {
      paramCount++;
      query += ` AND test_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND test_date <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY test_date ASC`;

    const result = await req.db.query(query, params);

    res.json({
      success: true,
      data: {
        metricName: metricName,
        dataPoints: result.rows,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('Get metrics trends error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve metrics trends',
      message: error.message
    });
  }
}

module.exports = {
  getDashboardOverview,
  getSystemDetails,
  getKeyFindings,
  getDailyPlan,
  getMetricsTrends
};
