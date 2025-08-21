// Script to fix existing metrics with null system_id values
const { Pool } = require('pg');
const healthSystemsService = require('../services/healthSystems');

async function fixExistingMetrics() {
  console.log('🔧 Fixing existing metrics with null system_id values...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Get all metrics with null system_id
    const nullMetrics = await pool.query(`
      SELECT id, metric_name
      FROM metrics 
      WHERE system_id IS NULL
      ORDER BY id
    `);

    console.log(`Found ${nullMetrics.rows.length} metrics with null system_id`);

    if (nullMetrics.rows.length === 0) {
      console.log('✅ No metrics need fixing');
      await pool.end();
      return;
    }

    let fixed = 0;
    let failed = 0;

    // Process each metric
    for (const metric of nullMetrics.rows) {
      try {
        // Use the same mapping logic as the fix (without category for existing data)
        const systemId = healthSystemsService.mapMetricToSystem(
          metric.metric_name, 
          null // No category available for existing metrics
        );

        if (systemId) {
          // Update the metric with the correct system_id
          await pool.query(
            'UPDATE metrics SET system_id = $1 WHERE id = $2',
            [systemId, metric.id]
          );

          console.log(`✅ Fixed "${metric.metric_name}" → System ${systemId}`);
          fixed++;
        } else {
          console.log(`⚠️  Could not map "${metric.metric_name}"`);
          failed++;
        }
      } catch (error) {
        console.error(`❌ Error fixing "${metric.metric_name}":`, error.message);
        failed++;
      }
    }

    console.log(`\n📊 Migration Results:`);
    console.log(`✅ Fixed: ${fixed} metrics`);
    console.log(`❌ Failed: ${failed} metrics`);

    // Verify the fix worked
    const verification = await pool.query(`
      SELECT 
        COUNT(*) as total_metrics,
        COUNT(CASE WHEN system_id IS NULL THEN 1 END) as null_system_id,
        COUNT(CASE WHEN system_id IS NOT NULL THEN 1 END) as mapped_metrics
      FROM metrics
    `);

    console.log(`\n✅ Final Database State:`);
    console.log(`Total metrics: ${verification.rows[0].total_metrics}`);
    console.log(`Metrics with system_id: ${verification.rows[0].mapped_metrics}`);
    console.log(`Metrics without system_id: ${verification.rows[0].null_system_id}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  fixExistingMetrics().catch(console.error);
}

module.exports = { fixExistingMetrics };