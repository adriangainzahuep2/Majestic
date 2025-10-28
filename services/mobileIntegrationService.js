/**
 * Mobile Integration Service
 * Handles data synchronization and processing from mobile apps
 */

const { pool } = require('../database/schema');
const OpenAI = require('openai');

class MobileIntegrationService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Sync mobile device data to the main application
   */
  async syncMobileData(userId, { deviceId, data, timestamp }) {
    try {
      console.log(`[MOBILE] Syncing ${data.length} records from device ${deviceId}`);
      
      // Validate and process each data item
      const processedData = await Promise.all(
        data.map(item => this.processDataItem(item))
      );

      // Save to database
      const results = [];
      for (const item of processedData) {
        try {
          const result = await this.saveMobileDataItem(userId, deviceId, item);
          results.push(result);
        } catch (error) {
          console.error('[MOBILE] Error saving item:', error);
          results.push({ success: false, error: error.message, item });
        }
      }

      // Trigger AI analysis for new data
      const newMetrics = results.filter(r => r.success && r.metric_created);
      if (newMetrics.length > 0) {
        await this.triggerAnalysis(userId, newMetrics);
      }

      return {
        synced: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };

    } catch (error) {
      console.error('[MOBILE] Sync error:', error);
      throw error;
    }
  }

  /**
   * Process individual data item from mobile app
   */
  async processDataItem(item) {
    try {
      const processed = {
        type: item.type,
        value: item.value,
        unit: item.unit || null,
        timestamp: new Date(item.timestamp),
        metadata: item.metadata || {},
        category: this.categorizeData(item)
      };

      // Standardize data format based on type
      switch (item.type) {
        case 'metric':
          processed.name = item.name || this.extractMetricName(item.value, item.unit);
          processed.normalized_value = this.normalizeMetricValue(item.value, item.unit);
          break;
        
        case 'activity':
          processed.activity_type = item.activity_type;
          processed.duration = item.duration;
          processed.intensity = item.intensity;
          break;
        
        case 'symptom':
          processed.symptom_name = item.symptom_name;
          processed.severity = item.severity;
          processed.description = item.description;
          break;
      }

      return processed;

    } catch (error) {
      console.error('[MOBILE] Process item error:', error);
      throw error;
    }
  }

  /**
   * Save mobile data item to database
   */
  async saveMobileDataItem(userId, deviceId, item) {
    try {
      // Save to mobile_data table
      const result = await pool.query(`
        INSERT INTO mobile_data (
          user_id, device_id, data_type, data_value, unit, 
          timestamp, metadata, category, processed_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        userId,
        deviceId,
        item.type,
        item.value,
        item.unit,
        item.timestamp,
        JSON.stringify(item.metadata),
        item.category,
        JSON.stringify(item)
      ]);

      // If it's a metric, also save to main metrics table
      let metricCreated = false;
      if (item.type === 'metric') {
        try {
          await this.saveAsMetric(userId, item);
          metricCreated = true;
        } catch (metricError) {
          console.warn('[MOBILE] Failed to save as metric:', metricError.message);
        }
      }

      return {
        success: true,
        id: result.rows[0].id,
        metric_created: metricCreated
      };

    } catch (error) {
      console.error('[MOBILE] Save item error:', error);
      throw error;
    }
  }

  /**
   * Save metric data to main metrics table
   */
  async saveAsMetric(userId, item) {
    const metricName = item.name || this.extractMetricName(item.value, item.unit);
    const testDate = new Date(item.timestamp).toISOString().split('T')[0];

    await pool.query(`
      INSERT INTO metrics (
        user_id, metric_name, metric_value, metric_unit, test_date, 
        source, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, metric_name, test_date) 
      DO UPDATE SET
        metric_value = EXCLUDED.metric_value,
        metric_unit = EXCLUDED.metric_unit,
        updated_at = CURRENT_TIMESTAMP
    `, [
      userId,
      metricName,
      item.value,
      item.unit,
      testDate,
      'mobile',
      JSON.stringify(item.metadata)
    ]);
  }

  /**
   * Retrieve mobile data with filters
   */
  async getMobileData(userId, { startDate, endDate, dataTypes }) {
    try {
      let query = `
        SELECT * FROM mobile_data 
        WHERE user_id = $1
      `;
      const params = [userId];
      let paramIndex = 2;

      if (startDate) {
        query += ` AND timestamp >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND timestamp <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      if (dataTypes && dataTypes.length > 0) {
        query += ` AND data_type = ANY($${paramIndex})`;
        params.push(dataTypes);
        paramIndex++;
      }

      query += ` ORDER BY timestamp DESC LIMIT 1000`;

      const result = await pool.query(query, params);
      
      return result.rows.map(row => ({
        id: row.id,
        type: row.data_type,
        value: row.data_value,
        unit: row.unit,
        timestamp: row.timestamp,
        category: row.category,
        metadata: row.metadata,
        processed_data: row.processed_data
      }));

    } catch (error) {
      console.error('[MOBILE] Get data error:', error);
      throw error;
    }
  }

  /**
   * Categorize data based on type and content
   */
  categorizeData(item) {
    const categories = {
      metric: 'health_metrics',
      activity: 'fitness_activity',
      symptom: 'health_symptoms',
      medication: 'medication_log'
    };

    return categories[item.type] || 'other';
  }

  /**
   * Extract metric name from value and unit
   */
  extractMetricName(value, unit) {
    // Use AI to determine metric name from value and unit
    return `Unknown Metric (${value} ${unit || ''})`;
  }

  /**
   * Normalize metric value to standard units
   */
  normalizeMetricValue(value, unit) {
    // Implementation would include unit conversion logic
    return parseFloat(value);
  }

  /**
   * Trigger AI analysis after data sync
   */
  async triggerAnalysis(userId, newMetrics) {
    try {
      // This would integrate with the insights refresh service
      const insightsService = require('./insightsRefresh');
      const affectedSystems = new Set([1, 7]); // Cardiovascular and Endocrine as examples
      
      await insightsService.processUploadRefresh(pool, userId, affectedSystems);
      console.log(`[MOBILE] Analysis triggered for ${newMetrics.length} new metrics`);
      
    } catch (error) {
      console.error('[MOBILE] Analysis trigger error:', error);
    }
  }

  /**
   * Get device information
   */
  async getDeviceInfo(userId) {
    try {
      const result = await pool.query(`
        SELECT 
          device_id,
          COUNT(*) as data_points,
          MIN(timestamp) as first_sync,
          MAX(timestamp) as last_sync
        FROM mobile_data 
        WHERE user_id = $1
        GROUP BY device_id
        ORDER BY last_sync DESC
      `, [userId]);

      return result.rows;

    } catch (error) {
      console.error('[MOBILE] Get device info error:', error);
      throw error;
    }
  }

  /**
   * Clean up old mobile data
   */
  async cleanupOldData(userId, daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await pool.query(`
        DELETE FROM mobile_data 
        WHERE user_id = $1 AND timestamp < $2
      `, [userId, cutoffDate]);

      return result.rowCount;

    } catch (error) {
      console.error('[MOBILE] Cleanup error:', error);
      throw error;
    }
  }
}

module.exports = new MobileIntegrationService();
