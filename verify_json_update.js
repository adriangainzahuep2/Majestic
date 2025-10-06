const fs = require('fs');
const path = require('path');
const AdminMasterService = require('./services/adminMasterService.js');

async function verifyJSONUpdate() {
  try {
    console.log('🔍 Verifying JSON catalog update process...');

    // Check if JSON files exist
    const publicDataDir = path.join(__dirname, 'public/data');
    const catalogPath = path.join(publicDataDir, 'metrics.catalog.json');
    const metricsPath = path.join(publicDataDir, 'metrics.json');

    if (fs.existsSync(catalogPath)) {
      const catalogContent = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      console.log(`✅ metrics.catalog.json exists: ${catalogContent.metrics.length} metrics, ${Object.keys(catalogContent.units_synonyms).length} unit synonyms`);
      console.log(`   Generated at: ${catalogContent.generated_at}`);
    } else {
      console.log('❌ metrics.catalog.json does not exist');
    }

    if (fs.existsSync(metricsPath)) {
      const metricsContent = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      console.log(`✅ metrics.json exists: ${metricsContent.length} metrics`);
    } else {
      console.log('❌ metrics.json does not exist');
    }

    // Check database state
    const pool = require('./database/schema.js').pool;
    const client = await pool.connect();

    const [metricsRes, synonymsRes, convRes] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM master_metrics'),
      client.query('SELECT COUNT(*) as count FROM master_metric_synonyms'),
      client.query('SELECT COUNT(*) as count FROM master_conversion_groups')
    ]);

    console.log('\n📊 Database state:');
    console.log(`   master_metrics: ${metricsRes.rows[0].count} records`);
    console.log(`   master_metric_synonyms: ${synonymsRes.rows[0].count} records`);
    console.log(`   master_conversion_groups: ${convRes.rows[0].count} records`);

    client.release();

    // Test syncToJSONFiles directly
    console.log('\n🔄 Testing syncToJSONFiles...');
    const adminService = AdminMasterService;
    await adminService.syncToJSONFiles(null, { added: 0, changed: 0, removed: 0 });

    console.log('✅ JSON sync completed');

  } catch (error) {
    console.error('❌ Error verifying JSON update:', error);
  }
}

verifyJSONUpdate();
