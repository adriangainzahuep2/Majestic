/**
 * Metric Service - Handles all metric-related operations
 * Fixes:
 * - HDL range mapping
 * - NULL value handling
 * - Confidence-based auto-mapping
 * - Synonym synchronization
 */

const fs = require('fs').promises;
const path = require('path');

class MetricService {
  constructor(pool) {
    this.pool = pool;
    this.HIGH_CONFIDENCE_THRESHOLD = 0.95;
    this.MEDIUM_CONFIDENCE_THRESHOLD = 0.75;
  }

  setPool(pool) {
    this.pool = pool;
  }

  /**
   * Get normal range for a metric, with user-specific custom ranges
   * @param {string} metricName - Name of the metric
   * @param {number} userId - Optional user ID for custom ranges
   * @returns {Object} Range object with min, max, and unit
   */
  async getNormalRange(metricName, userId = null) {
    try {
      // First check for user-specific custom range
      if (userId) {
        const customRange = await this.pool.query(`
          SELECT min_value, max_value, units
          FROM custom_reference_ranges
          WHERE user_id = $1 
            AND LOWER(metric_name) = LOWER($2)
            AND is_active = true
            AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
          ORDER BY valid_from DESC
          LIMIT 1
        `, [userId, metricName]);

        if (customRange.rows.length > 0) {
          const range = customRange.rows[0];
          return {
            min: parseFloat(range.min_value),
            max: parseFloat(range.max_value),
            unit: range.units,
            isCustom: true
          };
        }
      }

      // Get default range from master metrics
      const defaultRange = await this.pool.query(`
        SELECT normal_min, normal_max, canonical_unit
        FROM master_metrics
        WHERE LOWER(metric_name) = LOWER($1)
        LIMIT 1
      `, [metricName]);

      if (defaultRange.rows.length === 0) {
        return null;
      }

      const range = defaultRange.rows[0];
      return {
        min: parseFloat(range.normal_min),
        max: parseFloat(range.normal_max),
        unit: range.canonical_unit,
        isCustom: false
      };
    } catch (error) {
      console.error('Error getting normal range:', error);
      throw error;
    }
  }

  /**
   * Match a metric name against master metrics and synonyms
   * @param {string} inputName - The metric name to match
   * @param {number} confidenceThreshold - Minimum confidence for match (default 0.75)
   * @returns {Object|null} Match object with metric info and confidence score
   */
  async matchMetricByName(inputName, confidenceThreshold = 0.75) {
    try {
      // First try exact match on metric name
      const exactMatch = await this.pool.query(`
        SELECT metric_id, metric_name, system_id, canonical_unit, 
               normal_min, normal_max, 1.0 as confidence
        FROM master_metrics
        WHERE LOWER(metric_name) = LOWER($1)
        LIMIT 1
      `, [inputName]);

      if (exactMatch.rows.length > 0) {
        return this._formatMatchResult(exactMatch.rows[0]);
      }

      // Try exact match on synonyms
      const synonymMatch = await this.pool.query(`
        SELECT m.metric_id, m.metric_name, m.system_id, m.canonical_unit,
               m.normal_min, m.normal_max, 1.0 as confidence
        FROM master_metric_synonyms s
        JOIN master_metrics m ON s.metric_id = m.metric_id
        WHERE LOWER(s.synonym_name) = LOWER($1)
        LIMIT 1
      `, [inputName]);

      if (synonymMatch.rows.length > 0) {
        return this._formatMatchResult(synonymMatch.rows[0]);
      }

      // Try fuzzy matching using similarity function
      const fuzzyMatch = await this.pool.query(`
        SELECT metric_id, metric_name, system_id, canonical_unit,
               normal_min, normal_max,
               calculate_metric_match_confidence($1, metric_name) as confidence
        FROM master_metrics
        WHERE calculate_metric_match_confidence($1, metric_name) >= $2
        ORDER BY confidence DESC
        LIMIT 1
      `, [inputName, confidenceThreshold]);

      if (fuzzyMatch.rows.length > 0) {
        return this._formatMatchResult(fuzzyMatch.rows[0]);
      }

      // Try fuzzy matching on synonyms
      const fuzzySynonymMatch = await this.pool.query(`
        SELECT m.metric_id, m.metric_name, m.system_id, m.canonical_unit,
               m.normal_min, m.normal_max,
               calculate_metric_match_confidence($1, s.synonym_name) as confidence
        FROM master_metric_synonyms s
        JOIN master_metrics m ON s.metric_id = m.metric_id
        WHERE calculate_metric_match_confidence($1, s.synonym_name) >= $2
        ORDER BY confidence DESC
        LIMIT 1
      `, [inputName, confidenceThreshold]);

      if (fuzzySynonymMatch.rows.length > 0) {
        return this._formatMatchResult(fuzzySynonymMatch.rows[0]);
      }

      return null;
    } catch (error) {
      console.error('Error matching metric:', error);
      throw error;
    }
  }

  /**
   * Auto-map metrics based on confidence threshold
   * ≥95% confidence: Auto-map silently
   * <95% confidence: Return for manual review
   * @param {Array} unmatchedMetrics - Array of unmatched metric objects
   * @param {number} userId - User ID for logging
   * @returns {Object} Results with autoMapped and requiresReview arrays
   */
  async autoMapMetrics(unmatchedMetrics, userId) {
    const results = {
      autoMapped: [],
      requiresReview: []
    };

    for (const metric of unmatchedMetrics) {
      try {
        const match = await this.matchMetricByName(metric.name, 0.0);
        
        if (!match) {
          results.requiresReview.push({
            ...metric,
            match: null,
            confidence: 0
          });
          continue;
        }

        if (match.confidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
          // Auto-map with high confidence
          await this._saveMetric(userId, metric, match);
          results.autoMapped.push({
            original: metric,
            mapped: match,
            confidence: match.confidence
          });
        } else {
          // Require manual review
          results.requiresReview.push({
            original: metric,
            suggestedMatch: match,
            confidence: match.confidence
          });
        }
      } catch (error) {
        console.error(`Error processing metric ${metric.name}:`, error);
        results.requiresReview.push({
          ...metric,
          error: error.message
        });
      }
    }

    // Log auto-mapping results
    if (results.autoMapped.length > 0) {
      console.log(`Auto-mapped ${results.autoMapped.length} metrics with ≥95% confidence`);
    }

    return results;
  }

  /**
   * Save a matched metric to the database
   * @private
   */
  async _saveMetric(userId, originalMetric, match) {
    await this.pool.query(`
      INSERT INTO metrics (
        user_id, metric_name, metric_value, metric_unit, 
        system_id, test_date, source
      ) VALUES ($1, $2, $3, $4, $5, $6, 'auto_mapped')
    `, [
      userId,
      match.metric_name,
      originalMetric.value,
      originalMetric.unit,
      match.system_id,
      originalMetric.date || new Date().toISOString().split('T')[0]
    ]);
  }

  /**
   * Format match result consistently
   * @private
   */
  _formatMatchResult(row) {
    return {
      metric_id: row.metric_id,
      metric_name: row.metric_name,
      system_id: row.system_id,
      canonical_unit: row.canonical_unit,
      normal_min: row.normal_min ? parseFloat(row.normal_min) : null,
      normal_max: row.normal_max ? parseFloat(row.normal_max) : null,
      confidence: parseFloat(row.confidence)
    };
  }

  /**
   * Export synonyms to JSON file for frontend use
   * @param {string} outputPath - Path to write JSON file
   */
  async exportSynonymsToJSON(outputPath = './public/data/metric-synonyms.json') {
    try {
      const result = await this.pool.query(`
        SELECT jsonb_agg(
          jsonb_build_object(
            'synonym_id', s.synonym_id,
            'synonym_name', s.synonym_name,
            'metric_id', s.metric_id,
            'metric_name', m.metric_name,
            'system_id', m.system_id,
            'canonical_unit', m.canonical_unit
          )
          ORDER BY s.metric_id, s.synonym_id
        ) as synonyms
        FROM master_metric_synonyms s
        JOIN master_metrics m ON s.metric_id = m.metric_id
      `);

      const synonyms = result.rows[0].synonyms || [];
      
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write JSON file
      await fs.writeFile(
        outputPath,
        JSON.stringify(synonyms, null, 2),
        'utf8'
      );

      console.log(`✓ Exported ${synonyms.length} synonyms to ${outputPath}`);
      return synonyms;
    } catch (error) {
      console.error('Error exporting synonyms:', error);
      throw error;
    }
  }

  /**
   * Validate and fix metric data types
   * @param {Object} metricData - Raw metric data
   * @returns {Object} Validated and coerced data
   */
  validateMetricData(metricData) {
    const validated = { ...metricData };

    // Coerce numeric fields
    if (validated.value !== null && validated.value !== undefined) {
      const numValue = parseFloat(validated.value);
      validated.value = isNaN(numValue) ? null : numValue;
    }

    if (validated.normal_min !== null && validated.normal_min !== undefined) {
      const numMin = parseFloat(validated.normal_min);
      validated.normal_min = isNaN(numMin) ? null : numMin;
    }

    if (validated.normal_max !== null && validated.normal_max !== undefined) {
      const numMax = parseFloat(validated.normal_max);
      validated.normal_max = isNaN(numMax) ? null : numMax;
    }

    // Validate range consistency
    if (validated.normal_min !== null && 
        validated.normal_max !== null && 
        validated.normal_min > validated.normal_max) {
      console.warn(`Invalid range for ${validated.name}: min(${validated.normal_min}) > max(${validated.normal_max})`);
      // Swap them
      [validated.normal_min, validated.normal_max] = [validated.normal_max, validated.normal_min];
    }

    return validated;
  }

  /**
   * Check if a metric value is an outlier
   * @param {string} metricName - Name of the metric
   * @param {number} value - The value to check
   * @param {number} userId - Optional user ID for custom ranges
   * @returns {Object} Outlier status and details
   */
  async checkOutlier(metricName, value, userId = null) {
    try {
      const range = await this.getNormalRange(metricName, userId);
      
      if (!range) {
        return {
          isOutlier: false,
          reason: 'No reference range available'
        };
      }

      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        return {
          isOutlier: false,
          reason: 'Invalid numeric value'
        };
      }

      const isLow = numValue < range.min;
      const isHigh = numValue > range.max;
      const isOutlier = isLow || isHigh;

      return {
        isOutlier,
        isLow,
        isHigh,
        value: numValue,
        range: range,
        percentageFromNormal: isLow 
          ? ((numValue - range.min) / range.min * 100)
          : isHigh
          ? ((numValue - range.max) / range.max * 100)
          : 0
      };
    } catch (error) {
      console.error('Error checking outlier:', error);
      throw error;
    }
  }

  /**
   * Get all metrics for a user with outlier flagging
   * @param {number} userId - User ID
   * @param {Object} options - Query options (systemId, startDate, endDate)
   * @returns {Array} Array of metrics with outlier status
   */
  async getUserMetrics(userId, options = {}) {
    try {
      let query = `
        SELECT m.*, mm.normal_min, mm.normal_max, mm.canonical_unit,
               mm.system_id, mm.is_key_metric,
               CASE 
                 WHEN m.metric_value < mm.normal_min OR m.metric_value > mm.normal_max 
                 THEN true 
                 ELSE false 
               END as is_outlier,
               CASE
                 WHEN m.metric_value < mm.normal_min THEN 'low'
                 WHEN m.metric_value > mm.normal_max THEN 'high'
                 ELSE 'normal'
               END as status
        FROM metrics m
        LEFT JOIN master_metrics mm ON LOWER(m.metric_name) = LOWER(mm.metric_name)
        WHERE m.user_id = $1
      `;

      const params = [userId];
      let paramCount = 1;

      if (options.systemId) {
        paramCount++;
        query += ` AND mm.system_id = $${paramCount}`;
        params.push(options.systemId);
      }

      if (options.startDate) {
        paramCount++;
        query += ` AND m.test_date >= $${paramCount}`;
        params.push(options.startDate);
      }

      if (options.endDate) {
        paramCount++;
        query += ` AND m.test_date <= $${paramCount}`;
        params.push(options.endDate);
      }

      query += ` ORDER BY m.test_date DESC, m.metric_name`;

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting user metrics:', error);
      throw error;
    }
  }

  /**
   * Get metric trends over time
   * @param {number} userId - User ID
   * @param {string} metricName - Name of the metric
   * @param {number} months - Number of months to look back (default 12)
   * @returns {Array} Array of trend data points
   */
  async getMetricTrend(userId, metricName, months = 12) {
    try {
      const result = await this.pool.query(`
        SELECT 
          m.test_date,
          m.metric_value,
          m.metric_unit,
          mm.normal_min,
          mm.normal_max,
          CASE 
            WHEN m.metric_value < mm.normal_min THEN 'low'
            WHEN m.metric_value > mm.normal_max THEN 'high'
            ELSE 'normal'
          END as status
        FROM metrics m
        LEFT JOIN master_metrics mm ON LOWER(m.metric_name) = LOWER(mm.metric_name)
        WHERE m.user_id = $1 
          AND LOWER(m.metric_name) = LOWER($2)
          AND m.test_date >= CURRENT_DATE - INTERVAL '${months} months'
        ORDER BY m.test_date ASC
      `, [userId, metricName]);

      return result.rows;
    } catch (error) {
      console.error('Error getting metric trend:', error);
      throw error;
    }
  }

  /**
   * Run data integrity check
   * @returns {Array} Array of integrity issues
   */
  async checkDataIntegrity() {
    try {
      const result = await this.pool.query(`
        SELECT * FROM check_metric_data_integrity()
      `);

      return result.rows;
    } catch (error) {
      console.error('Error checking data integrity:', error);
      throw error;
    }
  }
}

module.exports = MetricService;
