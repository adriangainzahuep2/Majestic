const { HEALTH_SYSTEMS } = require('../database/schema');

class HealthSystemsService {
  constructor() {
    // Key metrics that determine tile colors
    this.keyMetrics = {
      1: ['LDL-C', 'LDL', 'ApoB', 'Lp(a)', 'Blood Pressure', 'HRV'], // Cardiovascular
      2: ['Cognitive Score', 'MRI', 'CT', 'Sleep Quality'], // Nervous/Brain
      3: ['Spirometry', 'FEV1', 'Oxygen Saturation', 'SpO2'], // Respiratory
      4: ['Lean Mass', 'Muscle Mass', 'Grip Strength'], // Muscular
      5: ['Bone Density', 'DEXA', 'Fracture History'], // Skeletal
      6: ['ALT', 'AST', 'Liver Enzymes', 'Microbiome Diversity'], // Digestive
      7: ['HbA1c', 'Glucose', 'Fasting Glucose', 'TSH'], // Endocrine
      8: ['Creatinine', 'eGFR', 'BUN'], // Urinary
      9: ['Testosterone', 'Estrogen', 'Progesterone'], // Reproductive
      10: ['Dermatology Exam', 'Skin Biopsy'], // Integumentary
      11: ['hs-CRP', 'CRP', 'IL-6', 'TNF-alpha'], // Immune/Inflammation
      12: ['Eye Exam', 'Vision Test', 'Hearing Test'], // Sensory
      13: ['Epigenetic Age', 'Biological Age', 'Telomere Length'] // Genetics & Biological Age
    };

    // Recency thresholds (in months)
    this.recencyThresholds = {
      labs: 12,
      imaging: 24, // 2 years, but varies 2-5 years
      cognitive: 12,
      epigenetic: 18
    };

    // Metric to system mapping
    this.metricSystemMap = this.buildMetricSystemMap();
  }

  buildMetricSystemMap() {
    const map = new Map();

    // Cardiovascular metrics
    const cardiovascularMetrics = [
      'LDL', 'LDL-C', 'LDL Cholesterol', 'ApoB', 'Apolipoprotein B', 'Lp(a)', 'Lipoprotein(a)',
      'HDL', 'HDL-C', 'Total Cholesterol', 'Triglycerides', 'Blood Pressure', 'Systolic', 'Diastolic',
      'HRV', 'Heart Rate Variability', 'Resting Heart Rate'
    ];
    cardiovascularMetrics.forEach(metric => map.set(metric.toLowerCase(), 1));

    // Nervous/Brain metrics
    const nervousMetrics = [
      'Cognitive Score', 'MRI', 'CT', 'Sleep Quality', 'Sleep Score', 'REM Sleep', 'Deep Sleep',
      'Montreal Cognitive Assessment', 'MoCA', 'Mini Mental State'
    ];
    nervousMetrics.forEach(metric => map.set(metric.toLowerCase(), 2));

    // Respiratory metrics
    const respiratoryMetrics = [
      'Spirometry', 'FEV1', 'FVC', 'Oxygen Saturation', 'SpO2', 'Peak Flow'
    ];
    respiratoryMetrics.forEach(metric => map.set(metric.toLowerCase(), 3));

    // Muscular metrics
    const muscularMetrics = [
      'Lean Mass', 'Muscle Mass', 'Grip Strength', 'Body Fat Percentage', 'Skeletal Muscle Mass'
    ];
    muscularMetrics.forEach(metric => map.set(metric.toLowerCase(), 4));

    // Skeletal metrics
    const skeletalMetrics = [
      'Bone Density', 'DEXA', 'T-Score', 'Z-Score', 'Calcium', 'Vitamin D', '25-OH Vitamin D'
    ];
    skeletalMetrics.forEach(metric => map.set(metric.toLowerCase(), 5));

    // Digestive metrics
    const digestiveMetrics = [
      'ALT', 'AST', 'ALP', 'Bilirubin', 'Liver Enzymes', 'GGT', 'Albumin',
      'Microbiome Diversity', 'Gut Health Score'
    ];
    digestiveMetrics.forEach(metric => map.set(metric.toLowerCase(), 6));

    // Endocrine metrics
    const endocrineMetrics = [
      'HbA1c', 'Hemoglobin A1c', 'Glucose', 'Fasting Glucose', 'Random Glucose',
      'TSH', 'T3', 'T4', 'Free T3', 'Free T4', 'Insulin', 'HOMA-IR'
    ];
    endocrineMetrics.forEach(metric => map.set(metric.toLowerCase(), 7));

    // Urinary metrics
    const urinaryMetrics = [
      'Creatinine', 'eGFR', 'BUN', 'Blood Urea Nitrogen', 'Uric Acid', 'Protein', 'Albumin/Creatinine'
    ];
    urinaryMetrics.forEach(metric => map.set(metric.toLowerCase(), 8));

    // Reproductive metrics
    const reproductiveMetrics = [
      'Testosterone', 'Total Testosterone', 'Free Testosterone', 'Estrogen', 'Estradiol',
      'Progesterone', 'FSH', 'LH', 'SHBG'
    ];
    reproductiveMetrics.forEach(metric => map.set(metric.toLowerCase(), 9));

    // Integumentary metrics
    const integumentaryMetrics = [
      'Dermatology Exam', 'Skin Biopsy', 'Melanoma Check', 'Mole Assessment'
    ];
    integumentaryMetrics.forEach(metric => map.set(metric.toLowerCase(), 10));

    // Immune/Inflammation metrics
    const immuneMetrics = [
      'hs-CRP', 'CRP', 'C-Reactive Protein', 'IL-6', 'Interleukin-6', 'TNF-alpha',
      'ESR', 'White Blood Cell Count', 'WBC', 'Neutrophils', 'Lymphocytes'
    ];
    immuneMetrics.forEach(metric => map.set(metric.toLowerCase(), 11));

    // Sensory metrics
    const sensoryMetrics = [
      'Eye Exam', 'Vision Test', 'Visual Acuity', 'Hearing Test', 'Audiometry'
    ];
    sensoryMetrics.forEach(metric => map.set(metric.toLowerCase(), 12));

    // Genetics & Biological Age metrics
    const biologicalAgeMetrics = [
      'Epigenetic Age', 'Biological Age', 'Telomere Length', 'DNA Methylation Age'
    ];
    biologicalAgeMetrics.forEach(metric => map.set(metric.toLowerCase(), 13));

    return map;
  }

  mapMetricToSystem(metricName, category = null) {
    // Try exact match first
    const exactMatch = this.metricSystemMap.get(metricName.toLowerCase());
    if (exactMatch) return exactMatch;

    // Try partial matching
    for (const [key, systemId] of this.metricSystemMap.entries()) {
      if (metricName.toLowerCase().includes(key) || key.includes(metricName.toLowerCase())) {
        return systemId;
      }
    }

    // If category is provided, try to map by category
    if (category) {
      const categorySystemMap = {
        'cardiovascular': 1,
        'cardiac': 1,
        'heart': 1,
        'brain': 2,
        'cognitive': 2,
        'neurological': 2,
        'respiratory': 3,
        'lung': 3,
        'muscle': 4,
        'strength': 4,
        'bone': 5,
        'skeletal': 5,
        'liver': 6,
        'digestive': 6,
        'gut': 6,
        'hormone': 7,
        'endocrine': 7,
        'metabolic': 7,
        'kidney': 8,
        'renal': 8,
        'urinary': 8,
        'reproductive': 9,
        'skin': 10,
        'dermatology': 10,
        'immune': 11,
        'inflammation': 11,
        'vision': 12,
        'hearing': 12,
        'sensory': 12,
        'genetics': 13,
        'aging': 13,
        'longevity': 13
      };

      for (const [cat, systemId] of Object.entries(categorySystemMap)) {
        if (category.toLowerCase().includes(cat)) {
          return systemId;
        }
      }
    }

    // Default to immune/inflammation system for unclassified metrics
    return 11;
  }

  isKeyMetric(systemId, metricName) {
    const systemKeyMetrics = this.keyMetrics[systemId] || [];
    return systemKeyMetrics.some(keyMetric => 
      metricName.toLowerCase().includes(keyMetric.toLowerCase()) ||
      keyMetric.toLowerCase().includes(metricName.toLowerCase())
    );
  }

  calculateTileColor(systemId, metrics) {
    // Get key metrics for this system
    const keyMetrics = metrics.filter(m => m.is_key_metric);
    
    if (keyMetrics.length === 0) {
      return 'gray'; // No key metrics available
    }

    // Check recency of key metrics
    const now = new Date();
    let hasRecentData = false;
    let hasOutliers = false;

    for (const metric of keyMetrics) {
      const testDate = new Date(metric.test_date);
      const monthsOld = (now - testDate) / (1000 * 60 * 60 * 24 * 30);

      // Determine recency threshold based on metric type
      let threshold = this.recencyThresholds.labs; // Default 12 months
      
      if (metric.metric_name.toLowerCase().includes('mri') || 
          metric.metric_name.toLowerCase().includes('ct') ||
          metric.metric_name.toLowerCase().includes('dexa')) {
        threshold = this.recencyThresholds.imaging; // 24 months
      } else if (metric.metric_name.toLowerCase().includes('cognitive')) {
        threshold = this.recencyThresholds.cognitive; // 12 months
      } else if (metric.metric_name.toLowerCase().includes('epigenetic') ||
                 metric.metric_name.toLowerCase().includes('telomere')) {
        threshold = this.recencyThresholds.epigenetic; // 18 months
      }

      if (monthsOld <= threshold) {
        hasRecentData = true;
      }

      if (metric.is_outlier) {
        hasOutliers = true;
      }
    }

    // Tile color logic
    if (!hasRecentData) {
      return 'gray'; // No recent data
    }

    if (hasOutliers) {
      return 'red'; // Has concerning outliers
    }

    // For now, return green for systems with recent, non-outlier data
    // TODO: Implement more sophisticated risk assessment
    return 'green';
  }

  async getSystemDashboard(userId) {
    const { pool } = require('../database/schema');
    
    try {
      // Get all metrics for user
      const metricsResult = await pool.query(`
        SELECT m.*, hs.name as system_name
        FROM metrics m
        JOIN health_systems hs ON m.system_id = hs.id
        WHERE m.user_id = $1
        ORDER BY m.system_id, m.test_date DESC
      `, [userId]);

      // Group metrics by system
      const systemMetrics = {};
      for (const metric of metricsResult.rows) {
        const systemId = metric.system_id;
        if (!systemMetrics[systemId]) {
          systemMetrics[systemId] = {
            system: HEALTH_SYSTEMS.find(s => s.id === systemId),
            metrics: []
          };
        }
        systemMetrics[systemId].metrics.push(metric);
      }

      // Calculate tile colors and prepare dashboard data
      const dashboard = [];
      for (const system of HEALTH_SYSTEMS) {
        const systemData = systemMetrics[system.id];
        const metrics = systemData ? systemData.metrics : [];
        
        dashboard.push({
          id: system.id,
          name: system.name,
          description: system.description,
          color: this.calculateTileColor(system.id, metrics),
          keyMetricsCount: metrics.filter(m => m.is_key_metric).length,
          totalMetricsCount: metrics.length,
          lastUpdated: metrics.length > 0 ? metrics[0].test_date : null
        });
      }

      return dashboard;
    } catch (error) {
      console.error('Error getting system dashboard:', error);
      throw error;
    }
  }

  async getSystemDetails(userId, systemId) {
    const { pool } = require('../database/schema');
    
    try {
      // Get system info
      const system = HEALTH_SYSTEMS.find(s => s.id === parseInt(systemId));
      if (!system) {
        throw new Error('System not found');
      }

      // Get official metrics for this system
      const metricsResult = await pool.query(`
        SELECT m.*, u.filename, u.created_at as upload_date,
               CASE 
                 WHEN m.test_date IS NOT NULL THEN TO_CHAR(m.test_date, 'YYYY-MM-DD')
                 ELSE NULL 
               END as formatted_test_date
        FROM metrics m
        LEFT JOIN uploads u ON m.upload_id = u.id
        WHERE m.user_id = $1 AND m.system_id = $2
        ORDER BY m.test_date DESC NULLS LAST, m.is_key_metric DESC
      `, [userId, systemId]);

      // Get custom metrics for this system (user's private + approved global)
      // Exclude zero-value entries which are just type definitions, not actual metrics
      const customMetricsResult = await pool.query(`
        SELECT 
          id,
          metric_name,
          value,
          units,
          normal_range_min,
          normal_range_max,
          range_applicable_to,
          source_type,
          review_status,
          created_at,
          false as is_key_metric,
          'custom' as metric_type
        FROM user_custom_metrics 
        WHERE system_id = $1 
          AND (user_id = $2 OR (source_type = 'official' AND review_status = 'approved'))
          AND value != '0'
        ORDER BY created_at DESC
      `, [systemId, userId]);

      // Get cached insights using system_id (with fallback to prompt parsing)
      let insightsResult = await pool.query(`
        SELECT response, created_at
        FROM ai_outputs_log
        WHERE user_id = $1 AND output_type = $2 AND system_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId, 'system_insights', system.id]);
      
      // Feature flag: Fallback to prompt parsing if system_id lookup fails
      if (insightsResult.rows.length === 0) {
        console.log(`[FALLBACK] system_id lookup failed for userId=${userId} systemId=${system.id}, trying prompt parsing`);
        insightsResult = await pool.query(`
          SELECT response, created_at
          FROM ai_outputs_log
          WHERE user_id = $1 AND output_type = $2 AND prompt = $3
          ORDER BY created_at DESC
          LIMIT 1
        `, [userId, 'system_insights', `system_id:${system.id}`]);
      }

      const insights = insightsResult.rows.length > 0 ? 
        JSON.parse(insightsResult.rows[0].response) : null;

      // Separate key and non-key metrics (only official metrics can be key metrics)
      const keyMetrics = metricsResult.rows.filter(m => m.is_key_metric);
      const nonKeyMetrics = metricsResult.rows.filter(m => !m.is_key_metric);
      
      // All custom metrics go to Additional Metrics table
      const customMetrics = customMetricsResult.rows;

      return {
        system,
        keyMetrics,
        nonKeyMetrics,
        customMetrics,
        insights,
        color: this.calculateTileColor(systemId, metricsResult.rows)
      };
    } catch (error) {
      console.error('Error getting system details:', error);
      throw error;
    }
  }

  async getSystemTrends(userId, systemId) {
    const { pool } = require('../database/schema');
    
    try {
      // Get key lab metrics for this system
      const labMetricsResult = await pool.query(`
        SELECT m.id, m.metric_name, m.metric_value, m.metric_unit, 
               m.test_date, m.created_at, m.reference_range,
               'lab' as source
        FROM metrics m
        WHERE m.user_id = $1 AND m.system_id = $2 AND m.is_key_metric = true
        ORDER BY m.metric_name, m.test_date ASC, m.created_at ASC
      `, [userId, systemId]);

      // Get visual study data for this system
      const visualStudiesResult = await pool.query(`
        SELECT i.id, i.test_date, i.created_at, i.metrics_json
        FROM imaging_studies i
        WHERE i.user_id = $1 AND i.linked_system_id = $2 
        AND i.metrics_json IS NOT NULL
        ORDER BY i.test_date ASC, i.created_at ASC
      `, [userId, systemId]);

      // Process lab metrics
      const metricData = {};
      const referenceMetrics = require('../public/data/metrics.json');

      // Add lab data points
      for (const row of labMetricsResult.rows) {
        const metricName = row.metric_name;
        
        if (!metricData[metricName]) {
          metricData[metricName] = {
            metric_name: metricName,
            series: [],
            range_band: null,
            points_count: 0
          };
        }

        metricData[metricName].series.push({
          t: row.test_date ? new Date(row.test_date).toISOString() : new Date(row.created_at).toISOString(),
          v: parseFloat(row.metric_value),
          source: 'lab'
        });
      }

      // Process visual study data and extract relevant measurements
      for (const study of visualStudiesResult.rows) {
        try {
          let measurements = [];
          
          // Robust parsing: handle object, string, or invalid data
          if (study.metrics_json) {
            if (typeof study.metrics_json === 'object' && Array.isArray(study.metrics_json)) {
              // Already parsed JSONB array
              measurements = study.metrics_json;
            } else if (typeof study.metrics_json === 'object') {
              // JSONB object - wrap in array
              measurements = [study.metrics_json];
            } else if (typeof study.metrics_json === 'string') {
              if (study.metrics_json === '[object Object]' || study.metrics_json.startsWith('[object')) {
                // Invalid serialization - skip with warning
                console.warn(`[TRENDS] Study ${study.id} has invalid metrics_json: ${study.metrics_json.substring(0, 50)}... - flagging for cleanup`);
                // TODO: Log this for cleanup script
                continue;
              }
              // Try to parse JSON string
              try {
                const parsed = JSON.parse(study.metrics_json);
                measurements = Array.isArray(parsed) ? parsed : [parsed];
              } catch (innerError) {
                console.warn(`[TRENDS] Study ${study.id} has unparseable metrics_json - skipping`);
                continue;
              }
            }
          }
          
          // Filter to only metrics for this system and key metrics
          for (const measurement of measurements) {
            if (!measurement || !measurement.name) continue;
            
            const measurementName = measurement.name;
            
            // Check if this measurement corresponds to a key metric for this system
            if (this.isKeyMetric(systemId, measurementName)) {
              if (!metricData[measurementName]) {
                metricData[measurementName] = {
                  metric_name: measurementName,
                  series: [],
                  range_band: null,
                  points_count: 0
                };
              }

              metricData[measurementName].series.push({
                t: study.test_date ? new Date(study.test_date).toISOString() : new Date(study.created_at).toISOString(),
                v: parseFloat(measurement.value),
                source: 'visual',
                needs_review: false
              });
            }
          }
        } catch (parseError) {
          console.warn(`[TRENDS] Error processing study ${study.id} metrics:`, parseError.message);
          // Continue processing other studies
        }
      }

      // Process each metric: deduplicate, add reference ranges, filter by minimum points
      const trendsResponse = [];
      
      for (const [metricName, data] of Object.entries(metricData)) {
        // Sort by timestamp
        data.series.sort((a, b) => new Date(a.t) - new Date(b.t));
        
        // Deduplicate same-day entries (keep latest)
        const deduplicatedSeries = [];
        const seenDates = new Set();
        
        for (let i = data.series.length - 1; i >= 0; i--) {
          const point = data.series[i];
          const dateKey = new Date(point.t).toDateString();
          
          if (!seenDates.has(dateKey)) {
            seenDates.add(dateKey);
            deduplicatedSeries.unshift(point);
          }
        }
        
        // Only include metrics with ≥ 2 data points
        if (deduplicatedSeries.length >= 2) {
          // Look up reference range from metrics.json
          let rangeBand = null;
          const referenceData = referenceMetrics.find(ref => 
            ref.metric && ref.metric.toLowerCase() === metricName.toLowerCase()
          );
          
          if (referenceData && referenceData.normalRangeMin !== undefined && referenceData.normalRangeMax !== undefined) {
            rangeBand = {
              min: referenceData.normalRangeMin,
              max: referenceData.normalRangeMax,
              source: "Baseline"
            };
          }

          trendsResponse.push({
            metric_id: `${systemId}_${metricName.replace(/[^a-zA-Z0-9]/g, '_')}`,
            metric_name: metricName,
            series: deduplicatedSeries,
            range_band: rangeBand,
            points_count: deduplicatedSeries.length
          });
        }
      }

      return trendsResponse;
      
    } catch (error) {
      console.error('Error getting system trends:', error);
      throw error;
    }
  }

  isKeyMetric(systemId, metricName) {
    // Check if a metric name (from visual studies) corresponds to a key metric for this system
    // This is a simple implementation - could be enhanced with more sophisticated mapping
    
    const keyMetricPatterns = {
      1: ['cholesterol', 'ldl', 'hdl', 'triglyceride'], // Cardiovascular
      2: ['glucose', 'hba1c', 'insulin'], // Endocrine  
      3: ['creatinine', 'bun', 'egfr'], // Renal
      4: ['alt', 'ast', 'bilirubin'], // Hepatic
      5: ['wbc', 'rbc', 'hemoglobin', 'hematocrit', 'platelet'], // Hematologic
      6: ['tsh', 'testosterone', 'estrogen'], // Reproductive
      7: ['cortisol', 'vitamin'], // Nutritional
      8: ['calcium', 'phosphorus', 'vitamin d'], // Skeletal
      9: ['crp', 'esr', 'il-6'], // Immune
      10: [], // Nervous - typically no visual study metrics
      11: [], // Respiratory - typically chest X-rays, not quantitative
      12: [], // Digestive - typically endoscopy, not quantitative  
      13: [] // Genetics - typically genetic testing, not visual studies
    };

    const patterns = keyMetricPatterns[systemId] || [];
    const lowerMetricName = metricName.toLowerCase();
    
    return patterns.some(pattern => lowerMetricName.includes(pattern.toLowerCase()));
  }

  async getTrendData(userId, metricNames) {
    const { pool } = require('../database/schema');
    
    try {
      const placeholders = metricNames.map((_, i) => `$${i + 2}`).join(',');
      
      const result = await pool.query(`
        SELECT metric_name, metric_value, metric_unit, test_date
        FROM metrics
        WHERE user_id = $1 AND metric_name IN (${placeholders})
        ORDER BY metric_name, test_date ASC
      `, [userId, ...metricNames]);

      // Group by metric name
      const trends = {};
      for (const row of result.rows) {
        if (!trends[row.metric_name]) {
          trends[row.metric_name] = [];
        }
        trends[row.metric_name].push({
          date: row.test_date,
          value: parseFloat(row.metric_value),
          unit: row.metric_unit
        });
      }

      return trends;
    } catch (error) {
      console.error('Error getting trend data:', error);
      throw error;
    }
  }
}

module.exports = new HealthSystemsService();
