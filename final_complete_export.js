const XLSX = require('xlsx');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createFinalCompleteExport() {
  try {
    console.log('=== CREATING COMPLETE 127+ METRICS EXPORT ===');
    
    // 1. Get user's actual metrics from database
    console.log('1. Fetching user metrics...');
    const userResult = await pool.query(`
      SELECT 
        'Your Data' as data_source,
        m.id::text as id,
        m.metric_name,
        m.metric_value::text as value,
        m.metric_unit as unit,
        m.reference_range,
        TO_CHAR(m.test_date, 'YYYY-MM-DD') as test_date,
        CASE WHEN m.is_key_metric THEN 'Yes' ELSE 'No' END as is_key_metric,
        hs.name as system_name,
        COALESCE(up.filename, 'Manual Entry') as source_file
      FROM metrics m
      LEFT JOIN health_systems hs ON m.system_id = hs.id
      LEFT JOIN uploads up ON m.upload_id = up.id
      ORDER BY hs.name, m.metric_name, m.test_date DESC
    `);

    // 2. Load reference metrics from the correct JSON file
    console.log('2. Loading clinical reference metrics...');
    const referenceData = JSON.parse(fs.readFileSync('./uploads/ref_metrics.json', 'utf8'));
    const referenceMetrics = referenceData.map((metric, index) => ({
      data_source: 'Clinical Reference',
      id: `ref_${index + 1}`,
      metric_name: metric.metric,
      value: '',
      unit: metric.units || '',
      reference_range: `${metric.normalRangeMin || ''}-${metric.normalRangeMax || ''} ${metric.units || ''}`.trim(),
      test_date: '',
      is_key_metric: metric.isKey ? 'Yes' : 'No',
      system_name: metric.system,
      source_file: 'Clinical Database'
    }));

    // 3. Get custom metric types
    console.log('3. Fetching custom metric types...');
    const customResult = await pool.query(`
      SELECT 
        'Custom Type' as data_source,
        id::text,
        metric_name,
        '' as value,
        units as unit,
        CONCAT(normal_range_min, '-', normal_range_max, ' ', units) as reference_range,
        TO_CHAR(created_at, 'YYYY-MM-DD') as test_date,
        'Custom' as is_key_metric,
        (SELECT name FROM health_systems WHERE id = system_id) as system_name,
        CONCAT('Created by ', (SELECT name FROM users WHERE id = user_id)) as source_file
      FROM user_custom_metrics
      ORDER BY metric_name
    `);

    // 4. Combine everything
    const allMetrics = [
      ...userResult.rows,
      ...referenceMetrics,
      ...customResult.rows
    ];

    console.log(`✅ DATA COLLECTION COMPLETE:`);
    console.log(`   📊 User metrics: ${userResult.rows.length}`);
    console.log(`   📋 Reference metrics: ${referenceMetrics.length}`);
    console.log(`   🔧 Custom types: ${customResult.rows.length}`);  
    console.log(`   🎯 TOTAL METRICS: ${allMetrics.length}`);

    // 5. Create comprehensive Excel workbook
    const workbook = XLSX.utils.book_new();
    
    // Main sheet: ALL METRICS COMBINED
    const allSheet = XLSX.utils.json_to_sheet(allMetrics);
    XLSX.utils.book_append_sheet(workbook, allSheet, `ALL ${allMetrics.length} METRICS`);
    
    // Separate sheets for each data type
    const userSheet = XLSX.utils.json_to_sheet(userResult.rows);
    XLSX.utils.book_append_sheet(workbook, userSheet, `Your Data (${userResult.rows.length})`);
    
    const refSheet = XLSX.utils.json_to_sheet(referenceMetrics);
    XLSX.utils.book_append_sheet(workbook, refSheet, `Clinical Ref (${referenceMetrics.length})`);
    
    const customSheet = XLSX.utils.json_to_sheet(customResult.rows);
    XLSX.utils.book_append_sheet(workbook, customSheet, `Custom Types (${customResult.rows.length})`);

    // 6. Save with descriptive filename
    const filename = `COMPLETE_${allMetrics.length}_HEALTH_METRICS.xlsx`;
    const filepath = `./uploads/${filename}`;

    if (!fs.existsSync('./uploads')) {
      fs.mkdirSync('./uploads', { recursive: true });
    }

    XLSX.writeFile(workbook, filepath);

    // 7. Create CSV backup of combined data
    const csvData = allMetrics.map(row => {
      return Object.keys(row).map(key => {
        const value = row[key];
        if (value === null || value === undefined) return '';
        const str = String(value);
        return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',');
    });
    
    const headers = Object.keys(allMetrics[0]).join(',');
    const csvContent = [headers, ...csvData].join('\n');
    const csvFilename = `COMPLETE_${allMetrics.length}_HEALTH_METRICS.csv`;
    
    fs.writeFileSync(`./uploads/${csvFilename}`, csvContent);

    // 8. Verify files
    const stats = fs.statSync(filepath);
    console.log(`\n🎉 COMPLETE EXPORT CREATED SUCCESSFULLY!`);
    console.log(`📄 Excel file: ${filename} (${Math.round(stats.size/1024)} KB)`);
    console.log(`📄 CSV backup: ${csvFilename}`);
    console.log(`📊 Contains ${allMetrics.length} total health metrics`);
    console.log(`\n✅ This includes ALL metrics in your system:`);
    console.log(`   - Your actual lab results and measurements`);
    console.log(`   - Complete clinical reference database (126+ metrics)`);
    console.log(`   - Custom metric types you created`);

    return { 
      success: true, 
      filename, 
      total: allMetrics.length,
      breakdown: {
        user: userResult.rows.length,
        reference: referenceMetrics.length,
        custom: customResult.rows.length
      }
    };

  } catch (error) {
    console.error('❌ Export failed:', error);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

// Run the export
createFinalCompleteExport()
  .then(result => {
    if (result.success) {
      console.log(`\n🏆 SUCCESS: ${result.filename} contains ${result.total} metrics`);
      process.exit(0);
    } else {
      console.error(`\n💥 FAILED: ${result.error}`);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });