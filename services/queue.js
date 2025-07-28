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

        // Trigger system insights regeneration
        await this.regenerateSystemInsights(userId);

        // Schedule daily plan regeneration
        await this.addJob('generate-daily-plan', { userId }, { delay: 5000 });

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
        // Get user's recent metrics
        const metricsResult = await pool.query(`
          SELECT m.*, hs.name as system_name 
          FROM metrics m
          JOIN health_systems hs ON m.system_id = hs.id
          WHERE m.user_id = $1 
          AND m.test_date >= CURRENT_DATE - INTERVAL '30 days'
          ORDER BY m.test_date DESC
        `, [userId]);

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
      // Get metrics grouped by system
      const metricsResult = await pool.query(`
        SELECT m.*, hs.name as system_name
        FROM metrics m
        JOIN health_systems hs ON m.system_id = hs.id
        WHERE m.user_id = $1
        ORDER BY m.system_id, m.test_date DESC
      `, [userId]);

      const systemMetrics = this.organizeMetricsBySystem(metricsResult.rows);

      // Generate insights for each system with data
      for (const [systemName, metrics] of Object.entries(systemMetrics)) {
        if (metrics.length > 0) {
          // Check if insights are cached (within 24 hours)
          const cachedInsights = await pool.query(`
            SELECT * FROM ai_outputs_log
            WHERE user_id = $1 AND output_type = $2 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
            ORDER BY created_at DESC LIMIT 1
          `, [userId, `system_insights_${systemName.toLowerCase()}`]);

          if (cachedInsights.rows.length === 0) {
            // Generate new insights
            const historicalData = metrics.slice(5); // Use older data for trends
            const currentMetrics = metrics.slice(0, 5); // Recent data

            const insights = await openaiService.generateSystemInsights(
              systemName, currentMetrics, historicalData
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
      // Get user's recent metrics
      const metricsResult = await pool.query(`
        SELECT m.*, hs.name as system_name 
        FROM metrics m
        JOIN health_systems hs ON m.system_id = hs.id
        WHERE m.user_id = $1 
        AND m.test_date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY m.test_date DESC
      `, [userId]);

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
