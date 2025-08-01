const XLSX = require('xlsx');
const { Pool } = require('pg');
const fs = require('fs');
const https = require('https');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fetchReferenceMetrics() {
  return new Promise((resolve, reject) => {
    const req = https.get('http://localhost:5000/api/metrics/reference', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const metrics = JSON.parse(data);
          resolve(metrics);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function createCompleteExport() {
  try {
    console.log('Fetching user metrics from database...');
    
    const userMetricsResult = await pool.query(`
      SELECT 
        m.id,
        m.metric_name,
        m.metric_value,
        m.metric_unit,
        m.reference_range,
        TO_CHAR(m.test_date, 'YYYY-MM-DD') as test_date,
        CASE WHEN m.is_key_metric THEN 'Yes' ELSE 'No' END as is_key_metric,
        CASE WHEN m.is_outlier THEN 'Yes' ELSE 'No' END as is_outlier,
        TO_CHAR(m.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        hs.name as system_name,
        hs.description as system_description,
        u.name as user_name,
        u.email as user_email,
        COALESCE(up.filename, 'Manual Entry') as source_file,
        up.upload_type,
        up.processing_status,
        'User Data' as data_type
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN uploads up ON m.upload_id = up.id
      ORDER BY hs.name, m.metric_name, m.test_date DESC
    `);

    console.log(`Found ${userMetricsResult.rows.length} user metrics`);

    console.log('Fetching reference clinical metrics...');
    let referenceMetrics = [];
    try {
      referenceMetrics = await fetchReferenceMetrics();
      console.log(`Found ${referenceMetrics.length} reference metrics`);
    } catch (error) {
      console.warn('Could not fetch reference metrics via API, loading from file...');
      // Try to load from file if API fails
      try {
        const metricUtils = require('./public/metricUtils.js');
        referenceMetrics = metricUtils.getAllMetrics ? metricUtils.getAllMetrics() : [];
      } catch (fileError) {
        console.warn('Could not load reference metrics from file either');
        referenceMetrics = [];
      }
    }

    // Transform reference metrics to match user metrics structure
    const transformedReferenceMetrics = referenceMetrics.map((metric, index) => ({
      id: `ref_${index + 1}`,
      metric_name: metric.metric,
      metric_value: null,
      metric_unit: metric.units || '',
      reference_range: `${metric.normalRangeMin}-${metric.normalRangeMax} ${metric.units || ''}`.trim(),
      test_date: null,
      is_key_metric: metric.isKey ? 'Yes' : 'No',
      is_outlier: 'No',
      created_at: null,
      system_name: metric.system,
      system_description: null,
      user_name: null,
      user_email: null,
      source_file: 'Clinical Reference Database',
      upload_type: 'Reference',
      processing_status: 'Complete',
      data_type: 'Reference Data'
    }));

    console.log('Fetching custom metrics...');
    const customMetricsResult = await pool.query(`
      SELECT 
        ucm.id,
        ucm.metric_name as custom_metric_name,
        ucm.units as custom_units,
        ucm.normal_range_min,
        ucm.normal_range_max,
        ucm.range_applicable_to,
        ucm.source_type,
        ucm.review_status,
        TO_CHAR(ucm.created_at, 'YYYY-MM-DD HH24:MI:SS') as custom_created_at,
        hs.name as custom_system_name,
        u.name as creator_name,
        u.email as creator_email
      FROM user_custom_metrics ucm
      LEFT JOIN health_systems hs ON ucm.system_id = hs.id
      LEFT JOIN users u ON ucm.user_id = u.id
      ORDER BY hs.name, ucm.metric_name
    `);

    console.log(`Found ${customMetricsResult.rows.length} custom metrics`);

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Sheet 1: User Metrics (actual data)
    const userSheet = XLSX.utils.json_to_sheet(userMetricsResult.rows);
    XLSX.utils.book_append_sheet(workbook, userSheet, 'User Metrics');

    // Sheet 2: Reference Clinical Metrics (template/reference data)
    const referenceSheet = XLSX.utils.json_to_sheet(transformedReferenceMetrics);
    XLSX.utils.book_append_sheet(workbook, referenceSheet, 'Reference Metrics');

    // Sheet 3: Custom Metric Types
    const customSheet = XLSX.utils.json_to_sheet(customMetricsResult.rows);
    XLSX.utils.book_append_sheet(workbook, customSheet, 'Custom Metric Types');

    // Sheet 4: Combined Summary
    const allMetrics = [
      ...userMetricsResult.rows,
      ...transformedReferenceMetrics
    ];
    const combinedSheet = XLSX.utils.json_to_sheet(allMetrics);
    XLSX.utils.book_append_sheet(workbook, combinedSheet, 'All Metrics Combined');

    // Ensure directory exists
    if (!fs.existsSync('./uploads')) {
      fs.mkdirSync('./uploads', { recursive: true });
    }

    const filename = 'Complete_Health_Metrics_Export.xlsx';
    const filepath = `./uploads/${filename}`;

    // Write file
    XLSX.writeFile(workbook, filepath);

    // Check file
    const stats = fs.statSync(filepath);
    console.log(`✅ Complete export created: ${filename} (${stats.size} bytes)`);
    console.log(`📊 Total records: ${allMetrics.length}`);
    console.log(`   - User metrics: ${userMetricsResult.rows.length}`);
    console.log(`   - Reference metrics: ${transformedReferenceMetrics.length}`);
    console.log(`   - Custom metric types: ${customMetricsResult.rows.length}`);

    return { 
      success: true, 
      filename, 
      filepath,
      counts: {
        user: userMetricsResult.rows.length,
        reference: transformedReferenceMetrics.length,
        custom: customMetricsResult.rows.length,
        total: allMetrics.length
      }
    };

  } catch (error) {
    console.error('❌ Export failed:', error);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  createCompleteExport();
}

module.exports = { createCompleteExport };