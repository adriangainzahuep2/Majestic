const XLSX = require('xlsx');
const { Pool } = require('pg');
const fs = require('fs');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createSimpleExport() {
  try {
    console.log('Fetching metrics data...');
    
    const result = await pool.query(`
      SELECT 
        m.id,
        m.metric_name,
        m.metric_value,
        m.metric_unit,
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

    console.log(`Found ${result.rows.length} metrics`);

    // Create workbook with simple approach
    const worksheet = XLSX.utils.json_to_sheet(result.rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Health Metrics');

    // Simple filename
    const filename = 'Health_Metrics_Export.xlsx';
    const filepath = `./uploads/${filename}`;

    // Ensure directory exists
    if (!fs.existsSync('./uploads')) {
      fs.mkdirSync('./uploads', { recursive: true });
    }

    // Write file with minimal options
    XLSX.writeFile(workbook, filepath);

    // Check file
    const stats = fs.statSync(filepath);
    console.log(`✅ File created: ${filename} (${stats.size} bytes)`);

    // Also create CSV backup
    const csvData = result.rows.map(row => {
      return Object.keys(row).map(key => {
        const value = row[key];
        if (value === null || value === undefined) return '';
        const str = String(value);
        return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',');
    });
    
    const headers = Object.keys(result.rows[0]).join(',');
    const csvContent = [headers, ...csvData].join('\n');
    
    fs.writeFileSync('./uploads/Health_Metrics_Export.csv', csvContent);
    console.log('✅ CSV backup also created');

    return { success: true, filename, filepath };

  } catch (error) {
    console.error('❌ Export failed:', error);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  createSimpleExport();
}

module.exports = { createSimpleExport };