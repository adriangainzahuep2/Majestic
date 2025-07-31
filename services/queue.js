const Bull = require('bull');
const openaiService = require('./openai');
const healthSystemsService = require('./healthSystems');
const { pool } = require('../database/schema');

class QueueService {
  constructor() {
    this.uploadQueue = null;
    this.dailyPlanQueue = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;

    // Skip Redis initialization if not available
    if (!process.env.REDIS_URL) {
      console.warn('Redis not available, running in direct processing mode');
      this.isInitialized = false;
      this.uploadQueue = null;
      this.dailyPlanQueue = null;
      return;
    }

    try {
      // Initialize Redis connection for Bull queue
      const redisConfig = {
        redis: {
          ...(process.env.REDIS_URL ? { url: process.env.REDIS_URL } : { port: 6379, host: '127.0.0.1' }),
          maxRetriesPerRequest: 2,
          retryDelayOnFailover: 100,
          connectTimeout: 5000,
          lazyConnect: true
        }
      };

      this.uploadQueue = new Bull('upload processing', redisConfig);
      this.dailyPlanQueue = new Bull('daily plan generation', redisConfig);

      this.setupUploadProcessor();
      this.setupDailyPlanProcessor();
      this.setupInsightsProcessors();
      this.setupScheduledJobs();

      this.isInitialized = true;
      console.log('Queue service initialized with Redis');
    } catch (error) {
      console.warn('Queue service initialization failed, running in direct processing mode:', error.message);
      this.isInitialized = false;
      this.uploadQueue = null;
      this.dailyPlanQueue = null;
    }
  }

  setupUploadProcessor() {
    this.uploadQueue.process('process-upload', 3, async (job) => {
      const { userId, fileName, fileData, uploadType, uploadId } = job.data;
      
      try {
        // Update upload status
        await pool.query(
          'UPDATE uploads SET processing_status = $1 WHERE id = $2',
          ['processing', uploadId]
        );

        let extractedData;
        const fileExtension = fileName.split('.').pop().toLowerCase();

        // Process based on file type
        if (['jpg', 'jpeg', 'png', 'pdf'].includes(fileExtension)) {
          // Convert to base64 if needed
          const base64Data = Buffer.isBuffer(fileData) ? 
            fileData.toString('base64') : fileData;

          // Determine processing type based on filename or content
          if (fileName.toLowerCase().includes('lab') || 
              fileName.toLowerCase().includes('blood') ||
              fileName.toLowerCase().includes('test')) {
            extractedData = await openaiService.processLabReport(base64Data, fileName);
          } else if (fileName.toLowerCase().includes('meal') ||
                     fileName.toLowerCase().includes('food')) {
            extractedData = await openaiService.analyzeMealPhoto(base64Data);
          } else if (fileName.toLowerCase().includes('aqi') ||
                     fileName.toLowerCase().includes('air')) {
            extractedData = await openaiService.analyzeAQIScreenshot(base64Data);
          } else {
            // Default to lab report processing
            extractedData = await openaiService.processLabReport(base64Data, fileName);
          }
        } else {
          throw new Error(`Unsupported file type: ${fileExtension}`);
        }

        // Save extracted metrics to database
        if (extractedData.metrics) {
          await this.saveMetricsToDatabase(userId, uploadId, extractedData.metrics);
        }

        // Update upload status
        await pool.query(
          'UPDATE uploads SET processing_status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['completed', uploadId]
        );

        // Trigger insights refresh using the new service
        const insightsRefreshService = require('./insightsRefresh');
        const affectedSystems = await this.getAffectedSystems(userId, extractedData.metrics);
        await insightsRefreshService.processUploadRefresh(pool, userId, affectedSystems);

        console.log(`Successfully processed upload ${uploadId} for user ${userId}`);

      } catch (error) {
        console.error(`Error processing upload ${uploadId}:`, error);
        
        await pool.query(
          'UPDATE uploads SET processing_status = $1, processing_error = $2 WHERE id = $3',
          ['failed', error.message, uploadId]
        );

        throw error;
      }
    });
  }

  setupDailyPlanProcessor() {
    this.dailyPlanQueue.process('generate-daily-plan', 2, async (job) => {
      const { userId } = job.data;

      try {
        // Get ALL user metrics for comprehensive daily plan - NO TIME LIMIT
        const metricsResult = await pool.query(`
          SELECT m.*, hs.name as system_name 
          FROM metrics m
          JOIN health_systems hs ON m.system_id = hs.id
          WHERE m.user_id = $1 
          ORDER BY m.test_date DESC
        `, [userId]);

        // Get recent questionnaire responses
        const responsesResult = await pool.query(`
          SELECT * FROM questionnaire_responses 
          WHERE user_id = $1 
          AND response_date >= CURRENT_DATE - INTERVAL '7 days'
          ORDER BY response_date DESC
        `, [userId]);

        // DIAGNOSTIC LOGGING - Required for debugging
        console.log(`=== DAILY PLAN DEBUG (dailyPlanQueue) ===`);
        console.log(`User: ${userId}`);
        console.log(`Total metrics fetched from DB: ${metricsResult.rows.length}`);
        console.log(`Systems with data: [${[...new Set(metricsResult.rows.map(m => m.system_name))].join(', ')}]`);
        console.log(`========================================`);

        const userMetrics = this.organizeMetricsBySystem(metricsResult.rows);
        const recentData = {
          questionnaire_responses: responsesResult.rows,
          last_upload_date: metricsResult.rows[0]?.test_date
        };

        // Generate daily plan
        const dailyPlan = await openaiService.generateDailyPlan(userMetrics, recentData);

        // Save to database (store as JSON in ai_outputs_log)
        await openaiService.logAIOutput(
          userId, 
          'daily_plan', 
          'Generate daily health plan', 
          dailyPlan, 
          0
        );

        console.log(`Generated daily plan for user ${userId}`);

        // TODO: Send push notification
        // await this.sendPushNotification(userId, 'Your daily health plan is ready!');

      } catch (error) {
        console.error(`Error generating daily plan for user ${userId}:`, error);
        throw error;
      }
    });
  }

  setupScheduledJobs() {
    // Daily plan generation at 3:00 AM
    this.dailyPlanQueue.add('scheduled-daily-plans', {}, {
      repeat: { cron: '0 3 * * *' },
      removeOnComplete: 10,
      removeOnFail: 5
    });

    // Process scheduled daily plans
    this.dailyPlanQueue.process('scheduled-daily-plans', async (job) => {
      try {
        // Get all active users
        const usersResult = await pool.query(`
          SELECT DISTINCT u.id 
          FROM users u
          JOIN metrics m ON u.id = m.user_id
          WHERE m.created_at >= CURRENT_DATE - INTERVAL '30 days'
        `);

        // Queue daily plan generation for each user
        for (const user of usersResult.rows) {
          await this.addJob('generate-daily-plan', { userId: user.id });
        }

        console.log(`Queued daily plan generation for ${usersResult.rows.length} users`);
      } catch (error) {
        console.error('Error in scheduled daily plans:', error);
      }
    });
  }

  async saveMetricsToDatabase(userId, uploadId, metrics) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      for (const metric of metrics) {
        // Map metric to health system
        const systemId = healthSystemsService.mapMetricToSystem(metric.name, metric.category);
        const isKeyMetric = healthSystemsService.isKeyMetric(systemId, metric.name);

        // Check for duplicates
        const existingResult = await client.query(`
          SELECT id FROM metrics 
          WHERE user_id = $1 AND metric_name = $2 AND test_date = $3
        `, [userId, metric.name, metric.test_date]);

        if (existingResult.rows.length === 0) {
          // Insert new metric
          await client.query(`
            INSERT INTO metrics (user_id, upload_id, system_id, metric_name, metric_value, 
                               metric_unit, reference_range, is_key_metric, test_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            userId, uploadId, systemId, metric.name, metric.value,
            metric.unit, metric.reference_range, isKeyMetric, metric.test_date
          ]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async regenerateSystemInsights(userId) {
    try {
      // Get ALL metrics grouped by system - NO TIME LIMITS
      const metricsResult = await pool.query(`
        SELECT m.*, hs.name as system_name
        FROM metrics m
        JOIN health_systems hs ON m.system_id = hs.id
        WHERE m.user_id = $1
        ORDER BY m.system_id, m.test_date DESC
      `, [userId]);

      // DIAGNOSTIC LOGGING - Required for debugging
      console.log(`=== REGENERATE SYSTEM INSIGHTS DEBUG ===`);
      console.log(`User: ${userId}`);
      console.log(`Total metrics fetched from DB: ${metricsResult.rows.length}`);
      console.log(`======================================`);

      const systemMetrics = this.organizeMetricsBySystem(metricsResult.rows);

      // Generate insights for each system with data
      for (const [systemName, metrics] of Object.entries(systemMetrics)) {
        if (metrics.length > 0) {
          console.log(`Processing ${systemName}: ${metrics.length} metrics [${metrics.map(m => m.metric_name).join(', ')}]`);
          
          // ALWAYS REGENERATE - Don't use cached insights for debugging
          // Pass ALL metrics for the system to AI analysis
          const insights = await openaiService.generateSystemInsights(
            systemName, metrics, [] // All metrics, no separate historical data
          );

          // Cache insights
          await openaiService.logAIOutput(
            userId,
            `system_insights_${systemName.toLowerCase()}`,
            `Generate insights for ${systemName} system`,
            insights,
            0
          );
        }
      }
    } catch (error) {
      console.error('Error regenerating system insights:', error);
    }
  }

  organizeMetricsBySystem(metricsArray) {
    const organized = {};

    for (const metric of metricsArray) {
      const systemName = metric.system_name || 'Unknown';
      if (!organized[systemName]) {
        organized[systemName] = [];
      }
      organized[systemName].push(metric);
    }

    return organized;
  }

  async getAffectedSystems(userId, metrics) {
    const healthSystemsService = require('./healthSystems');
    const systemIds = new Set();
    
    if (metrics && Array.isArray(metrics)) {
      for (const metric of metrics) {
        const systemId = healthSystemsService.mapMetricToSystem(metric.metric_name);
        if (systemId) {
          systemIds.add(systemId);
        }
      }
    }
    
    return Array.from(systemIds);
  }

  setupInsightsProcessors() {
    // System insights processor
    this.uploadQueue.process('generate-system-insights', 2, async (job) => {
      const { userId, systemId } = job.data;
      
      try {
        const openaiService = require('./openai');
        
        // Get system name
        const systemResult = await pool.query(
          'SELECT name FROM health_systems WHERE id = $1',
          [systemId]
        );
        
        if (systemResult.rows.length === 0) {
          throw new Error(`System ${systemId} not found`);
        }
        
        const systemName = systemResult.rows[0].name;
        
        // Get ALL current metrics for this system - NO LIMIT
        const metricsResult = await pool.query(`
          SELECT * FROM metrics 
          WHERE user_id = $1 AND system_id = $2 
          ORDER BY test_date DESC
        `, [userId, systemId]);
        
        // 2. DATA FETCHED FOR AI LOGGING
        console.log(`[AI INPUT METRICS] userId=${userId} system=${systemName} count=${metricsResult.rows.length}`);
        
        // Log each metric with value and range for comparison
        const detailedMetrics = metricsResult.rows.map(m => {
          const range = m.reference_range || '';
          const [min, max] = range.split('-').map(v => parseFloat(v?.trim()) || null);
          return {
            metric: m.metric_name,
            value: m.metric_value,
            normalMin: min,
            normalMax: max,
            range: range,
            outOfRange: (min !== null && m.metric_value < min) || (max !== null && m.metric_value > max)
          };
        });
        
        console.log(`[DETAILED METRICS]`, JSON.stringify(detailedMetrics, null, 2));
        
        if (metricsResult.rows.length > 0) {
          // 3. GPT CALL LOGGING
          console.log(`[GPT CALL PAYLOAD] userId=${userId} system=${systemName} metricsCount=${metricsResult.rows.length}`);
          
          // Pass ALL metrics to AI analysis - not just recent ones
          const insights = await openaiService.generateSystemInsights(
            systemName, 
            metricsResult.rows, // ALL metrics for this system
            [] // No separate historical data needed
          );
          
          // 4. GPT OUTPUT AND SAVE LOGGING
          console.log(`[GPT OUTPUT RECEIVED] userId=${userId} system=${systemName} insightsGenerated=true`);
          console.log(`[GPT OUTPUT CONTENT]`, JSON.stringify(insights, null, 2));
          
          // Save insights
          await openaiService.logAIOutput(
            userId,
            'system_insights',
            `system_id:${systemId}`,
            insights,
            0
          );
          
          console.log(`[GPT OUTPUT SAVED] userId=${userId} system=${systemName} outputType=system_insights`);
        } else {
          console.log(`[NO METRICS FOUND] userId=${userId} system=${systemName} skipping AI generation`);
        }
        
        console.log(`Generated system insights for user ${userId}, system ${systemName}`);
        
      } catch (error) {
        console.error(`Error generating system insights:`, error);
        throw error;
      }
    });

    // Key findings processor
    this.uploadQueue.process('generate-key-findings', 1, async (job) => {
      const { userId } = job.data;
      
      try {
        const openaiService = require('./openai');
        
        // Get ALL user metrics - NO TIME LIMIT for comprehensive analysis
        const metricsResult = await pool.query(`
          SELECT m.*, hs.name as system_name 
          FROM metrics m
          JOIN health_systems hs ON m.system_id = hs.id
          WHERE m.user_id = $1 
          ORDER BY m.test_date DESC
        `, [userId]);
        
        // DIAGNOSTIC LOGGING - Required for debugging
        console.log(`=== KEY FINDINGS DEBUG ===`);
        console.log(`User: ${userId}`);
        console.log(`Total metrics fetched from DB: ${metricsResult.rows.length}`);
        console.log(`Systems with data: [${[...new Set(metricsResult.rows.map(m => m.system_name))].join(', ')}]`);
        console.log(`=========================`);
        
        if (metricsResult.rows.length > 0) {
          const organizedMetrics = this.organizeMetricsBySystem(metricsResult.rows);
          const keyFindings = await openaiService.generateKeyFindings(organizedMetrics);
          
          // Save key findings
          await openaiService.logAIOutput(
            userId,
            'key_findings',
            'Generate key health findings',
            keyFindings,
            0
          );
        }
        
        console.log(`Generated key findings for user ${userId}`);
        
      } catch (error) {
        console.error(`Error generating key findings:`, error);
        throw error;
      }
    });

    // Daily plan processor (update existing to use new queue)
    this.uploadQueue.process('generate-daily-plan', 1, async (job) => {
      const { userId } = job.data;
      
      try {
        const openaiService = require('./openai');
        
        // Get ALL user metrics for comprehensive daily plan - NO TIME LIMIT
        const metricsResult = await pool.query(`
          SELECT m.*, hs.name as system_name 
          FROM metrics m
          JOIN health_systems hs ON m.system_id = hs.id
          WHERE m.user_id = $1 
          ORDER BY m.test_date DESC
        `, [userId]);

        // Get recent questionnaire responses
        const responsesResult = await pool.query(`
          SELECT * FROM questionnaire_responses 
          WHERE user_id = $1 
          AND response_date >= CURRENT_DATE - INTERVAL '7 days'
          ORDER BY response_date DESC
        `, [userId]);

        // DIAGNOSTIC LOGGING - Required for debugging
        console.log(`=== DAILY PLAN DEBUG (uploadQueue) ===`);
        console.log(`User: ${userId}`);
        console.log(`Total metrics fetched from DB: ${metricsResult.rows.length}`);
        console.log(`Systems with data: [${[...new Set(metricsResult.rows.map(m => m.system_name))].join(', ')}]`);
        console.log(`=====================================`);

        const userMetrics = this.organizeMetricsBySystem(metricsResult.rows);
        const recentData = {
          questionnaire_responses: responsesResult.rows,
          last_upload_date: metricsResult.rows[0]?.test_date
        };

        // Generate daily plan
        const dailyPlan = await openaiService.generateDailyPlan(userMetrics, recentData);

        // Save to database
        await openaiService.logAIOutput(
          userId, 
          'daily_plan', 
          'Generate daily health plan', 
          dailyPlan, 
          0
        );

        console.log(`Generated daily plan for user ${userId}`);

      } catch (error) {
        console.error(`Error generating daily plan for user ${userId}:`, error);
        throw error;
      }
    });
  }

  async addJob(jobType, data, options = {}) {
    if (!this.isInitialized || !this.uploadQueue || !this.dailyPlanQueue) {
      console.warn(`Queue not available, processing ${jobType} directly`);
      return await this.processDirectly(jobType, data);
    }

    const queue = jobType.includes('daily-plan') ? this.dailyPlanQueue : this.uploadQueue;
    
    // Default options
    const defaultOptions = {
      attempts: 3,
      backoff: 'exponential',
      removeOnComplete: 50,
      removeOnFail: 20
    };

    return await queue.add(jobType, data, { ...defaultOptions, ...options });
  }

  async processDirectly(jobType, data) {
    try {
      if (jobType === 'process-upload') {
        return await this.processUploadDirectly(data);
      } else if (jobType === 'generate-daily-plan') {
        return await this.processDailyPlanDirectly(data);
      } else if (jobType === 'generate-system-insights') {
        return await this.processSystemInsightsDirectly(data);
      } else if (jobType === 'generate-key-findings') {
        return await this.processKeyFindingsDirectly(data);
      }
    } catch (error) {
      console.error(`Direct processing error for ${jobType}:`, error);
      throw error;
    }
  }

  async processUploadDirectly(data) {
    const { userId, fileName, fileData, uploadType, uploadId } = data;
    
    try {
      // Update upload status
      if (uploadId) {
        await pool.query(
          'UPDATE uploads SET processing_status = $1 WHERE id = $2',
          ['processing', uploadId]
        );
      }

      let extractedData;
      const fileExtension = fileName.split('.').pop().toLowerCase();

      // Process based on file type
      if (['jpg', 'jpeg', 'png', 'pdf'].includes(fileExtension)) {
        // Convert to base64 if needed
        const base64Data = Buffer.isBuffer(fileData) ? 
          fileData.toString('base64') : fileData;

        // Determine processing type based on filename or content
        if (fileName.toLowerCase().includes('lab') || 
            fileName.toLowerCase().includes('blood') ||
            fileName.toLowerCase().includes('test')) {
          extractedData = await openaiService.processLabReport(base64Data, fileName);
        } else if (fileName.toLowerCase().includes('meal') ||
                   fileName.toLowerCase().includes('food')) {
          extractedData = await openaiService.analyzeMealPhoto(base64Data);
        } else if (fileName.toLowerCase().includes('aqi') ||
                   fileName.toLowerCase().includes('air')) {
          extractedData = await openaiService.analyzeAQIScreenshot(base64Data);
        } else {
          // Default to lab report processing
          extractedData = await openaiService.processLabReport(base64Data, fileName);
        }
      } else {
        throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      // Save extracted metrics to database
      if (extractedData.metrics && uploadId) {
        await this.saveMetricsToDatabase(userId, uploadId, extractedData.metrics);
      }

      // Update upload status
      if (uploadId) {
        await pool.query(
          'UPDATE uploads SET processing_status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['completed', uploadId]
        );
      }

      // Trigger system insights regeneration
      await this.regenerateSystemInsights(userId);

      console.log(`Successfully processed upload ${uploadId || 'direct'} for user ${userId}`);
      return { success: true, data: extractedData };

    } catch (error) {
      console.error(`Error processing upload ${uploadId || 'direct'}:`, error);
      
      if (uploadId) {
        await pool.query(
          'UPDATE uploads SET processing_status = $1, processing_error = $2 WHERE id = $3',
          ['failed', error.message, uploadId]
        );
      }

      throw error;
    }
  }

  async processDailyPlanDirectly(data) {
    const { userId } = data;

    try {
      // Get ALL user metrics for comprehensive daily plan - NO TIME LIMIT
      const metricsResult = await pool.query(`
        SELECT m.*, hs.name as system_name 
        FROM metrics m
        JOIN health_systems hs ON m.system_id = hs.id
        WHERE m.user_id = $1 
        ORDER BY m.test_date DESC
      `, [userId]);

      // DIAGNOSTIC LOGGING - Required for debugging
      console.log(`=== DAILY PLAN DIRECT PROCESSING DEBUG ===`);
      console.log(`User: ${userId}`);
      console.log(`Total metrics fetched from DB: ${metricsResult.rows.length}`);
      console.log(`Systems with data: [${[...new Set(metricsResult.rows.map(m => m.system_name))].join(', ')}]`);
      console.log(`=========================================`);

      // Get recent questionnaire responses
      const responsesResult = await pool.query(`
        SELECT * FROM questionnaire_responses 
        WHERE user_id = $1 
        AND response_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY response_date DESC
      `, [userId]);

      const userMetrics = this.organizeMetricsBySystem(metricsResult.rows);
      const recentData = {
        questionnaire_responses: responsesResult.rows,
        last_upload_date: metricsResult.rows[0]?.test_date
      };

      // Generate daily plan
      const dailyPlan = await openaiService.generateDailyPlan(userMetrics, recentData);

      // Save to database (store as JSON in ai_outputs_log)
      await openaiService.logAIOutput(
        userId, 
        'daily_plan', 
        'Generate daily health plan', 
        dailyPlan, 
        0
      );

      console.log(`Generated daily plan for user ${userId}`);
      return { success: true, data: dailyPlan };

    } catch (error) {
      console.error(`Error generating daily plan for user ${userId}:`, error);
      throw error;
    }
  }

  async processSystemInsightsDirectly(data) {
    const { userId, systemId } = data;
    
    try {
      console.log(`[GEN-INSIGHTS START] userId=${userId} systemId=${systemId}`);
      
      const openaiService = require('./openai');
      
      // Get system name
      const systemResult = await pool.query(`
        SELECT name FROM health_systems WHERE id = $1
      `, [systemId]);
      
      if (systemResult.rows.length === 0) {
        console.error(`[GEN-INSIGHTS ERROR] userId=${userId} systemId=${systemId} error=System not found`);
        return;
      }
      
      const systemName = systemResult.rows[0].name;
      console.log(`[SYSTEM NAME RESOLVED] userId=${userId} systemId=${systemId} systemName=${systemName}`);
      
      // Get ALL current metrics for this system - NO LIMIT
      const metricsResult = await pool.query(`
        SELECT * FROM metrics 
        WHERE user_id = $1 AND system_id = $2 
        ORDER BY test_date DESC
      `, [userId, systemId]);
      
      // 2. DATA FETCHED FOR AI LOGGING
      console.log(`[AI INPUT METRICS] userId=${userId} systemId=${systemId} count=${metricsResult.rows.length}`);
      const detailedMetrics = metricsResult.rows.map(m => {
        const range = m.reference_range || '';
        const [min, max] = range.split('-').map(v => parseFloat(v?.trim()) || null);
        return {
          metric: m.metric_name,
          value: m.metric_value,
          normalMin: min,
          normalMax: max,
          range: range,
          outOfRange: (min !== null && m.metric_value < min) || (max !== null && m.metric_value > max)
        };
      });
      console.log(`metrics=${JSON.stringify(detailedMetrics, null, 2)}`);
      
      if (metricsResult.rows.length > 0) {
        // 3. GPT CALL LOGGING
        console.log(`[GPT CALL INITIATED] userId=${userId} systemId=${systemId} metricsCount=${metricsResult.rows.length}`);
        
        // Pass ALL metrics to AI analysis
        const insights = await openaiService.generateSystemInsights(
          systemName, 
          metricsResult.rows,
          []
        );
        
        // 4. GPT OUTPUT AND SAVE LOGGING
        console.log(`[GPT OUTPUT RECEIVED] userId=${userId} systemId=${systemId} responseLength=${JSON.stringify(insights).length}`);
        console.log(`RESPONSE=${JSON.stringify(insights, null, 2)}`);
        
        // Save insights
        await openaiService.logAIOutput(
          userId,
          'system_insights',
          `system_id:${systemId}`,
          insights,
          0
        );
        
        console.log(`[GPT OUTPUT SAVED] userId=${userId} systemId=${systemId}`);
      } else {
        console.log(`[GEN-INSIGHTS ERROR] userId=${userId} systemId=${systemId} error=No metrics found`);
      }
      
      console.log(`Generated system insights for user ${userId}, system ${systemName} (direct processing)`);
      return { success: true, data: insights };
      
    } catch (error) {
      console.error(`[GEN-INSIGHTS ERROR] userId=${userId} systemId=${systemId} error=${error.message}`);
      throw error;
    }
  }

  async processKeyFindingsDirectly(data) {
    const { userId } = data;
    
    try {
      const openaiService = require('./openai');
      
      // Get ALL user metrics - NO TIME LIMIT for comprehensive analysis
      const metricsResult = await pool.query(`
        SELECT m.*, hs.name as system_name 
        FROM metrics m
        JOIN health_systems hs ON m.system_id = hs.id
        WHERE m.user_id = $1 
        ORDER BY m.test_date DESC
      `, [userId]);
      
      const userMetrics = this.organizeMetricsBySystem(metricsResult.rows);
      
      // Generate key findings
      const keyFindings = await openaiService.generateKeyFindings(userMetrics);
      
      // Save to database
      await openaiService.logAIOutput(
        userId, 
        'key_findings', 
        'Generate key health findings', 
        keyFindings, 
        0
      );
      
      console.log(`Generated key findings for user ${userId} (direct processing)`);
      return { success: true, data: keyFindings };
      
    } catch (error) {
      console.error(`Error generating key findings for user ${userId} (direct):`, error);
      throw error;
    }
  }

  async getQueueStats() {
    if (!this.isInitialized || !this.uploadQueue || !this.dailyPlanQueue) {
      return {
        uploads: { waiting: 0, active: 0, completed: 0, failed: 0 },
        dailyPlans: { waiting: 0, active: 0, completed: 0, failed: 0 },
        mode: 'direct_processing'
      };
    }

    try {
      const uploadStats = await this.uploadQueue.getJobCounts();
      const dailyPlanStats = await this.dailyPlanQueue.getJobCounts();

      return {
        uploads: uploadStats,
        dailyPlans: dailyPlanStats,
        mode: 'queue_processing'
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {
        uploads: { waiting: 0, active: 0, completed: 0, failed: 0 },
        dailyPlans: { waiting: 0, active: 0, completed: 0, failed: 0 },
        mode: 'error'
      };
    }
  }
}

module.exports = new QueueService();
