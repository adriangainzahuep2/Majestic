const XLSX = require('xlsx');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function generateMetricsExcel() {
  try {
    console.log('Connecting to database...');
    
    // Query 1: All regular metrics with comprehensive details
    const metricsQuery = `
      SELECT 
        m.id,
        m.metric_name,
        m.metric_value,
        m.metric_unit,
        m.reference_range,
        m.test_date,
        m.is_key_metric,
        m.is_outlier,
        m.created_at,
        hs.name as system_name,
        hs.description as system_description,
        u.name as user_name,
        u.email as user_email,
        CASE 
          WHEN up.filename IS NOT NULL THEN up.filename
          ELSE 'Manual Entry'
        END as source_file,
        up.upload_type,
        up.processing_status,
        up.created_at as upload_date
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN uploads up ON m.upload_id = up.id
      ORDER BY hs.name, m.metric_name, m.test_date DESC
    `;

    // Query 2: Custom metric types
    const customMetricsQuery = `
      SELECT 
        ucm.id,
        ucm.metric_name as custom_metric_name,
        ucm.units as custom_units,
        ucm.normal_range_min,
        ucm.normal_range_max,
        ucm.range_applicable_to,
        ucm.source_type,
        ucm.review_status,
        ucm.created_at as custom_created_at,
        hs.name as custom_system_name,
        u.name as creator_name,
        u.email as creator_email
      FROM user_custom_metrics ucm
      LEFT JOIN health_systems hs ON ucm.system_id = hs.id
      LEFT JOIN users u ON ucm.user_id = u.id
      ORDER BY hs.name, ucm.metric_name
    `;

    // Query 3: Health systems overview
    const systemsQuery = `
      SELECT 
        hs.id,
        hs.name as system_name,
        hs.description,
        COUNT(m.id) as total_metrics,
        COUNT(CASE WHEN m.is_key_metric = true THEN 1 END) as key_metrics_count,
        MAX(m.test_date) as latest_test_date,
        MIN(m.test_date) as earliest_test_date
      FROM health_systems hs
      LEFT JOIN metrics m ON hs.id = m.system_id
      GROUP BY hs.id, hs.name, hs.description
      ORDER BY hs.name
    `;

    // Query 4: Upload summary
    const uploadsQuery = `
      SELECT 
        up.id,
        up.filename,
        up.file_type,
        up.file_size,
        up.upload_type,
        up.processing_status,
        up.created_at as upload_date,
        up.processed_at,
        u.name as user_name,
        COUNT(m.id) as metrics_extracted
      FROM uploads up
      LEFT JOIN users u ON up.user_id = u.id
      LEFT JOIN metrics m ON up.id = m.upload_id
      GROUP BY up.id, up.filename, up.file_type, up.file_size, up.upload_type, 
               up.processing_status, up.created_at, up.processed_at, u.name
      ORDER BY up.created_at DESC
    `;

    console.log('Executing database queries...');
    
    const [metricsResult, customMetricsResult, systemsResult, uploadsResult] = await Promise.all([
      pool.query(metricsQuery),
      pool.query(customMetricsQuery),
      pool.query(systemsQuery),
      pool.query(uploadsQuery)
    ]);

    console.log('Creating Excel workbook...');
    
    // Create a new workbook
    const workbook = XLSX.utils.book_new();

    // Sheet 1: All Metrics Data
    const metricsWorksheet = XLSX.utils.json_to_sheet(metricsResult.rows, {
      header: [
        'id', 'metric_name', 'metric_value', 'metric_unit', 'reference_range',
        'test_date', 'is_key_metric', 'is_outlier', 'created_at', 'system_name',
        'system_description', 'user_name', 'user_email', 'source_file',
        'upload_type', 'processing_status', 'upload_date'
      ]
    });
    XLSX.utils.book_append_sheet(workbook, metricsWorksheet, 'All Metrics');

    // Sheet 2: Custom Metric Types
    const customMetricsWorksheet = XLSX.utils.json_to_sheet(customMetricsResult.rows, {
      header: [
        'id', 'custom_metric_name', 'custom_units', 'normal_range_min',
        'normal_range_max', 'range_applicable_to', 'source_type', 'review_status',
        'custom_created_at', 'custom_system_name', 'creator_name', 'creator_email'
      ]
    });
    XLSX.utils.book_append_sheet(workbook, customMetricsWorksheet, 'Custom Metric Types');

    // Sheet 3: Systems Overview
    const systemsWorksheet = XLSX.utils.json_to_sheet(systemsResult.rows, {
      header: [
        'id', 'system_name', 'description', 'total_metrics', 'key_metrics_count',
        'latest_test_date', 'earliest_test_date'
      ]
    });
    XLSX.utils.book_append_sheet(workbook, systemsWorksheet, 'Systems Overview');

    // Sheet 4: Upload History
    const uploadsWorksheet = XLSX.utils.json_to_sheet(uploadsResult.rows, {
      header: [
        'id', 'filename', 'file_type', 'file_size', 'upload_type',
        'processing_status', 'upload_date', 'processed_at', 'user_name', 'metrics_extracted'
      ]
    });
    XLSX.utils.book_append_sheet(workbook, uploadsWorksheet, 'Upload History');

    // Sheet 5: Summary Statistics
    const summaryData = [
      { metric: 'Total Metrics', value: metricsResult.rows.length },
      { metric: 'Total Custom Metric Types', value: customMetricsResult.rows.length },
      { metric: 'Total Health Systems', value: systemsResult.rows.length },
      { metric: 'Total Uploads', value: uploadsResult.rows.length },
      { metric: 'Key Metrics Count', value: metricsResult.rows.filter(m => m.is_key_metric).length },
      { metric: 'Outlier Metrics Count', value: metricsResult.rows.filter(m => m.is_outlier).length },
      { metric: 'Unique Metric Names', value: new Set(metricsResult.rows.map(m => m.metric_name)).size },
      { metric: 'Date Range (From)', value: metricsResult.rows.reduce((earliest, m) => 
        !earliest || (m.test_date && m.test_date < earliest) ? m.test_date : earliest, null) },
      { metric: 'Date Range (To)', value: metricsResult.rows.reduce((latest, m) => 
        !latest || (m.test_date && m.test_date > latest) ? m.test_date : latest, null) }
    ];
    
    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary Statistics');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `Majestic_Health_Metrics_Export_${timestamp}.xlsx`;
    const filepath = `./uploads/${filename}`;

    console.log('Writing Excel file...');
    
    // Ensure uploads directory exists
    const fs = require('fs');
    if (!fs.existsSync('./uploads')) {
      fs.mkdirSync('./uploads', { recursive: true });
    }
    
    // Write with explicit options for better compatibility
    XLSX.writeFile(workbook, filepath, { 
      bookType: 'xlsx', 
      type: 'buffer',
      cellStyles: true,
      sheetStubs: false 
    });
    
    // Verify file was created and is readable
    const stats = fs.statSync(filepath);
    console.log(`File size: ${stats.size} bytes`);
    
    if (stats.size < 1000) {
      throw new Error('Generated file appears to be too small - possible corruption');
    }

    console.log(`✅ Excel file created successfully: ${filename}`);
    console.log(`📊 Data Summary:`);
    console.log(`   - Total Metrics: ${metricsResult.rows.length}`);
    console.log(`   - Custom Metric Types: ${customMetricsResult.rows.length}`);
    console.log(`   - Health Systems: ${systemsResult.rows.length}`);
    console.log(`   - Upload Records: ${uploadsResult.rows.length}`);
    
    return { success: true, filename, filepath };
    
  } catch (error) {
    console.error('❌ Error generating Excel file:', error);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

// Run the export
if (require.main === module) {
  generateMetricsExcel();
}

module.exports = { generateMetricsExcel };