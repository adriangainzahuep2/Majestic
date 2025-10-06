const AdminMasterService = require('./services/adminMasterService.js');
const fs = require('fs');
const path = require('path');

async function testRollbackFunctionality() {
  try {
    console.log('🔍 Testing rollback functionality...');

    // Get current state before rollback
    const versions = await AdminMasterService.versions();
    if (versions.length === 0) {
      console.log('❌ No versions found for rollback test');
      return;
    }

    const latestVersion = versions[0];
    console.log(`📊 Latest version: ${latestVersion.version_id} - ${latestVersion.change_summary}`);

    // Get current counts before rollback
    const pool = require('./database/schema.js').pool;
    const client = await pool.connect();

    const [metricsBefore, synonymsBefore, convBefore] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM master_metrics'),
      client.query('SELECT COUNT(*) as count FROM master_metric_synonyms'),
      client.query('SELECT COUNT(*) as count FROM master_conversion_groups')
    ]);

    console.log('\n📊 State before rollback:');
    console.log(`   master_metrics: ${metricsBefore.rows[0].count}`);
    console.log(`   master_metric_synonyms: ${synonymsBefore.rows[0].count}`);
    console.log(`   master_conversion_groups: ${convBefore.rows[0].count}`);

    // Perform rollback to previous version (if exists)
    if (versions.length > 1) {
      const previousVersion = versions[1];
      console.log(`\n🔄 Rolling back to version ${previousVersion.version_id}...`);

      const rollbackResult = await AdminMasterService.rollback(previousVersion.version_id);

      if (rollbackResult.success) {
        console.log('✅ Rollback successful');

        // Check state after rollback
        const [metricsAfter, synonymsAfter, convAfter] = await Promise.all([
          client.query('SELECT COUNT(*) as count FROM master_metrics'),
          client.query('SELECT COUNT(*) as count FROM master_metric_synonyms'),
          client.query('SELECT COUNT(*) as count FROM master_conversion_groups')
        ]);

        console.log('\n📊 State after rollback:');
        console.log(`   master_metrics: ${metricsAfter.rows[0].count}`);
        console.log(`   master_metric_synonyms: ${synonymsAfter.rows[0].count}`);
        console.log(`   master_conversion_groups: ${convAfter.rows[0].count}`);

        // Rollback back to latest
        console.log('\n🔄 Rolling back to latest version...');
        await AdminMasterService.rollback(latestVersion.version_id);
        console.log('✅ Restored to latest version');
      }
    } else {
      console.log('ℹ️  Only one version exists, no rollback test possible');
    }

    client.release();

  } catch (error) {
    console.error('❌ Error testing rollback:', error);
  }
}

testRollbackFunctionality();
