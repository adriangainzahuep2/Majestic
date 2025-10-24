const fs = require('fs');
const path = require('path');

let metricsCache = null;

/**
 * Metrics Catalog
 * Central repository for all health metrics
 * Fixes: HDL range mapping, null value issues
 */

/**
 * Load metrics from JSON file
 */
function loadMetrics() {
  try {
    if (metricsCache) {
      return metricsCache;
    }

    const catalogPath = path.join(__dirname, '../public/data/metrics-catalog.json');
    
    try {
      const data = fs.readFileSync(catalogPath, 'utf8');
      metricsCache = JSON.parse(data);
      console.log(`[MetricsCatalog] Loaded ${metricsCache.length} metrics`);
      return metricsCache;
    } catch (fileError) {
      console.warn('[MetricsCatalog] File not found, using default catalog');
      metricsCache = getDefaultCatalog();
      return metricsCache;
    }

  } catch (error) {
    console.error('[MetricsCatalog] Load error:', error);
    return getDefaultCatalog();
  }
}

/**
 * Get all metrics
 */
function getAllMetrics() {
  return loadMetrics();
}

/**
 * Find metric by ID
 */
function findMetricById(metricId) {
  const metrics = loadMetrics();
  return metrics.find(m => m.metric_id === metricId);
}

/**
 * Find metric by name (with normalization)
 */
function findMetricByName(metricName) {
  const metrics = loadMetrics();
  const normalized = normalizeString(metricName);
  
  return metrics.find(m => normalizeString(m.metric_name) === normalized);
}

/**
 * Get metrics by system
 */
function getMetricsBySystem(systemId) {
  const metrics = loadMetrics();
  return metrics.filter(m => m.system_id === systemId);
}

/**
 * Get key metrics
 */
function getKeyMetrics() {
  const metrics = loadMetrics();
  return metrics.filter(m => m.is_key_metric === true);
}

/**
 * Search metrics
 */
function searchMetrics(query) {
  const metrics = loadMetrics();
  const normalized = normalizeString(query);
  
  return metrics.filter(m => 
    normalizeString(m.metric_name).includes(normalized) ||
    normalizeString(m.metric_id).includes(normalized)
  );
}

/**
 * Normalize string for comparison
 */
function normalizeString(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Get default catalog (fallback)
 */
function getDefaultCatalog() {
  return [
    {
      metric_id: 'cardiovascular_1',
      metric_name: 'Total Cholesterol',
      system_id: 1,
      canonical_unit: 'mg/dL',
      conversion_group_id: 'cholesterol',
      normal_min: 0,
      normal_max: 200,
      is_key_metric: true,
      source: 'default',
      explanation: 'Total amount of cholesterol in blood'
    },
    {
      metric_id: 'cardiovascular_2',
      metric_name: 'LDL Cholesterol',
      system_id: 1,
      canonical_unit: 'mg/dL',
      conversion_group_id: 'cholesterol',
      normal_min: 0,
      normal_max: 100,
      is_key_metric: true,
      source: 'default',
      explanation: 'Low-density lipoprotein (bad cholesterol)'
    },
    {
      metric_id: 'cardiovascular_3',
      metric_name: 'HDL Cholesterol',
      system_id: 1,
      canonical_unit: 'mg/dL',
      conversion_group_id: 'cholesterol',
      normal_min: 40,
      normal_max: 100,
      is_key_metric: true,
      source: 'default',
      explanation: 'High-density lipoprotein (good cholesterol)'
    },
    {
      metric_id: 'cardiovascular_4',
      metric_name: 'Triglycerides',
      system_id: 1,
      canonical_unit: 'mg/dL',
      conversion_group_id: 'triglycerides',
      normal_min: 0,
      normal_max: 150,
      is_key_metric: true,
      source: 'default',
      explanation: 'Type of fat found in blood'
    },
    {
      metric_id: 'cardiovascular_5',
      metric_name: 'Non-HDL Cholesterol',
      system_id: 1,
      canonical_unit: 'mg/dL',
      conversion_group_id: 'cholesterol',
      normal_min: 0,
      normal_max: 130,
      is_key_metric: false,
      source: 'default',
      explanation: 'Total cholesterol minus HDL cholesterol'
    },
    {
      metric_id: 'cardiovascular_11',
      metric_name: 'Apolipoprotein B (ApoB)',
      system_id: 1,
      canonical_unit: 'mg/dL',
      conversion_group_id: 'apolipoprotein',
      normal_min: 0,
      normal_max: 100,
      is_key_metric: true,
      source: 'default',
      explanation: 'Primary protein in LDL particles'
    },
    {
      metric_id: 'cardiovascular_12',
      metric_name: 'LDL Particle Number',
      system_id: 1,
      canonical_unit: 'nmol/L',
      conversion_group_id: 'ldl_particles',
      normal_min: 1000,
      normal_max: 1500,
      is_key_metric: true,
      source: 'default',
      explanation: 'Number of LDL particles in blood'
    },
    {
      metric_id: 'cardiovascular_13',
      metric_name: 'LDL Particle Size',
      system_id: 1,
      canonical_unit: 'nm',
      conversion_group_id: null,
      normal_min: 20.5,
      normal_max: 21.2,
      is_key_metric: false,
      source: 'default',
      explanation: 'Average size of LDL particles'
    },
    {
      metric_id: 'cardiovascular_14',
      metric_name: 'Small LDL-P',
      system_id: 1,
      canonical_unit: 'nmol/L',
      conversion_group_id: 'ldl_particles',
      normal_min: 0,
      normal_max: 500,
      is_key_metric: false,
      source: 'default',
      explanation: 'Number of small LDL particles'
    },
    {
      metric_id: 'cardiovascular_15',
      metric_name: 'Medium LDL-P',
      system_id: 1,
      canonical_unit: 'nmol/L',
      conversion_group_id: 'ldl_particles',
      normal_min: 0,
      normal_max: 500,
      is_key_metric: false,
      source: 'default',
      explanation: 'Number of medium LDL particles'
    },
    {
      metric_id: 'endocrine_1',
      metric_name: 'Glucose (Fasting)',
      system_id: 7,
      canonical_unit: 'mg/dL',
      conversion_group_id: 'glucose',
      normal_min: 70,
      normal_max: 100,
      is_key_metric: true,
      source: 'default',
      explanation: 'Blood sugar level after fasting'
    },
    {
      metric_id: 'endocrine_2',
      metric_name: 'HbA1c',
      system_id: 7,
      canonical_unit: '%',
      conversion_group_id: null,
      normal_min: 0,
      normal_max: 5.7,
      is_key_metric: true,
      source: 'default',
      explanation: 'Average blood sugar over 3 months'
    },
    {
      metric_id: 'endocrine_3',
      metric_name: 'TSH',
      system_id: 7,
      canonical_unit: 'mIU/L',
      conversion_group_id: null,
      normal_min: 0.4,
      normal_max: 4.0,
      is_key_metric: true,
      source: 'default',
      explanation: 'Thyroid stimulating hormone'
    }
  ];
}

/**
 * Reload catalog from database
 */
async function reloadFromDatabase(db) {
  try {
    const result = await db.query(`
      SELECT *
      FROM master_metrics
      ORDER BY system_id, metric_id
    `);

    // Save to JSON file
    const catalogPath = path.join(__dirname, '../public/data/metrics-catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify(result.rows, null, 2));

    // Clear cache
    metricsCache = null;

    console.log(`[MetricsCatalog] Reloaded ${result.rows.length} metrics from database`);

    return result.rows.length;

  } catch (error) {
    console.error('[MetricsCatalog] Reload from database error:', error);
    throw error;
  }
}

/**
 * Clear cache (force reload)
 */
function clearCache() {
  metricsCache = null;
}

module.exports = {
  getAllMetrics,
  findMetricById,
  findMetricByName,
  getMetricsBySystem,
  getKeyMetrics,
  searchMetrics,
  reloadFromDatabase,
  clearCache
};
