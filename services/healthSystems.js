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
      13: ['Epigenetic Age', 'Biological Age', 'Telomere Length'] // Biological Age
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

    // Biological Age metrics
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

      // Get metrics for this system
      const metricsResult = await pool.query(`
        SELECT m.*, u.filename, u.created_at as upload_date
        FROM metrics m
        LEFT JOIN uploads u ON m.upload_id = u.id
        WHERE m.user_id = $1 AND m.system_id = $2
        ORDER BY m.test_date DESC, m.is_key_metric DESC
      `, [userId, systemId]);

      // Get cached insights
      const insightsResult = await pool.query(`
        SELECT response, created_at
        FROM ai_outputs_log
        WHERE user_id = $1 AND output_type = $2 AND prompt = $3
        ORDER BY created_at DESC
        LIMIT 1
      `, [userId, 'system_insights', `system_id:${system.id}`]);

      const insights = insightsResult.rows.length > 0 ? 
        JSON.parse(insightsResult.rows[0].response) : null;

      // Separate key and non-key metrics
      const keyMetrics = metricsResult.rows.filter(m => m.is_key_metric);
      const nonKeyMetrics = metricsResult.rows.filter(m => !m.is_key_metric);

      return {
        system,
        keyMetrics,
        nonKeyMetrics,
        insights,
        color: this.calculateTileColor(systemId, metricsResult.rows)
      };
    } catch (error) {
      console.error('Error getting system details:', error);
      throw error;
    }
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
