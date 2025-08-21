// Script to update is_key_metric column based on healthSystems.js definitions
const { Pool } = require('pg');
const healthSystemsService = require('../services/healthSystems');

async function updateKeyMetrics() {
  console.log('🔑 Updating key metric flags based on healthSystems.js definitions...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Get all metrics with their system_id
    const allMetrics = await pool.query(`
      SELECT id, metric_name, system_id, is_key_metric
      FROM metrics 
      WHERE system_id IS NOT NULL
      ORDER BY system_id, metric_name
    `);

    console.log(`Found ${allMetrics.rows.length} metrics to evaluate`);

    let updatedCount = 0;
    let alreadyCorrectCount = 0;
    let noChangeCount = 0;

    // Process each metric
    for (const metric of allMetrics.rows) {
      try {
        // Use the healthSystems.js logic to determine if this should be a key metric
        const shouldBeKey = healthSystemsService.isKeyMetric(metric.system_id, metric.metric_name);
        
        // Check if we need to update
        if (shouldBeKey !== metric.is_key_metric) {
          // Update the database
          await pool.query(
            'UPDATE metrics SET is_key_metric = $1 WHERE id = $2',
            [shouldBeKey, metric.id]
          );

          const status = shouldBeKey ? '🔑 Key' : '📊 Regular';
          console.log(`✅ Updated "${metric.metric_name}" (System ${metric.system_id}) → ${status}`);
          updatedCount++;
        } else {
          if (shouldBeKey) {
            console.log(`✓ "${metric.metric_name}" already correctly marked as key`);
            alreadyCorrectCount++;
          } else {
            noChangeCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing "${metric.metric_name}":`, error.message);
      }
    }

    console.log(`\n📊 Update Results:`);
    console.log(`✅ Updated: ${updatedCount} metrics`);
    console.log(`✓ Already correct: ${alreadyCorrectCount} metrics`);
    console.log(`📊 Regular metrics (no change): ${noChangeCount} metrics`);

    // Verify the results
    const verification = await pool.query(`
      SELECT 
        COUNT(*) as total_metrics,
        COUNT(CASE WHEN is_key_metric = true THEN 1 END) as key_metrics,
        COUNT(CASE WHEN is_key_metric = false THEN 1 END) as regular_metrics
      FROM metrics
      WHERE system_id IS NOT NULL
    `);

    console.log(`\n✅ Final Database State:`);
    console.log(`Total metrics: ${verification.rows[0].total_metrics}`);
    console.log(`Key metrics: ${verification.rows[0].key_metrics}`);
    console.log(`Regular metrics: ${verification.rows[0].regular_metrics}`);

    // Show some examples of key metrics that were identified
    const keyExamples = await pool.query(`
      SELECT metric_name, system_id 
      FROM metrics 
      WHERE is_key_metric = true 
      ORDER BY system_id, metric_name 
      LIMIT 10
    `);

    if (keyExamples.rows.length > 0) {
      console.log(`\n🔑 Examples of key metrics now marked:`);
      keyExamples.rows.forEach(m => {
        console.log(`  • ${m.metric_name} (System ${m.system_id})`);
      });
    }

  } catch (error) {
    console.error('❌ Update failed:', error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  updateKeyMetrics().catch(console.error);
}

module.exports = { updateKeyMetrics };