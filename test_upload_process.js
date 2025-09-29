const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('./database/schema.js');

async function testUploadProcess() {
  try {
    console.log('🔍 Testing upload process...');

    // Read the uploaded file
    const filePath = path.join(__dirname, '../master_template (14).xlsx');
    if (!fs.existsSync(filePath)) {
      console.log('❌ File not found:', filePath);
      return;
    }

    const buffer = fs.readFileSync(filePath);
    console.log('✅ File loaded successfully');

    // Parse the workbook
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const conversionSheet = XLSX.utils.sheet_to_json(wb.Sheets['conversion_groups'] || {}, { defval: null });

    console.log(`📊 Excel conversion_groups count: ${conversionSheet.length}`);

    if (conversionSheet.length > 0) {
      console.log('\nSample Excel data:');
      conversionSheet.slice(0, 5).forEach(row => {
        console.log(`  - ${row.conversion_group_id}: ${row.canonical_unit} -> ${row.alt_unit}`);
      });
    }

    // Check database state
    const client = await pool.connect();
    const dbResult = await client.query('SELECT COUNT(*) as count FROM master_conversion_groups');
    console.log(`📊 Database conversion_groups count: ${dbResult.rows[0].count}`);

    client.release();

  } catch (error) {
    console.error('❌ Error testing upload process:', error);
  }
}

testUploadProcess();
