#!/usr/bin/env node

/**
 * Cleanup script for imaging_studies.metrics_json column
 * 
 * Fixes common serialization issues:
 * 1. "[object Object]" invalid serializations
 * 2. Double-encoded JSON strings 
 * 3. Ensures consistent JSONB format
 * 
 * Safe to run multiple times (idempotent)
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixMetricsJson() {
  console.log('🔧 Starting metrics_json cleanup...');
  
  let stats = {
    total: 0,
    alreadyGood: 0,
    fixedObjectString: 0,
    fixedDoubleEncoded: 0,
    setToNull: 0,
    errors: 0
  };

  try {
    // Get all imaging studies with metrics_json data
    const allStudiesResult = await pool.query(`
      SELECT id, metrics_json, study_type, test_date
      FROM imaging_studies 
      ORDER BY id
    `);

    stats.total = allStudiesResult.rows.length;
    console.log(`📊 Found ${stats.total} imaging studies to check`);

    for (const study of allStudiesResult.rows) {
      try {
        const { id, metrics_json } = study;
        
        // Case 1: Already null or valid JSONB object/array
        if (!metrics_json) {
          stats.alreadyGood++;
          continue;
        }
        
        // Case 2: Already a valid JSONB object/array (PostgreSQL returns as JS object)
        if (typeof metrics_json === 'object') {
          stats.alreadyGood++;
          continue;
        }

        // Case 3: String data - need to fix
        if (typeof metrics_json === 'string') {
          
          // Case 3a: "[object Object]" invalid serialization
          if (metrics_json === '[object Object]' || metrics_json.startsWith('[object')) {
            console.log(`🚨 Study ${id}: Invalid object serialization, setting to NULL`);
            await pool.query(`UPDATE imaging_studies SET metrics_json = NULL WHERE id = $1`, [id]);
            stats.setToNull++;
            continue;
          }

          // Case 3b: Try to parse as JSON (double-encoded case)
          try {
            const parsed = JSON.parse(metrics_json);
            
            // If parsed successfully, update with the parsed object
            console.log(`🔄 Study ${id}: Fixed double-encoded JSON`);
            await pool.query(`UPDATE imaging_studies SET metrics_json = $1::jsonb WHERE id = $2`, [parsed, id]);
            stats.fixedDoubleEncoded++;
            
          } catch (parseError) {
            // Case 3c: Unparseable string - set to null
            console.log(`⚠️  Study ${id}: Unparseable metrics_json, setting to NULL`);
            await pool.query(`UPDATE imaging_studies SET metrics_json = NULL WHERE id = $1`, [id]);
            stats.setToNull++;
          }
        }

      } catch (error) {
        console.error(`❌ Error processing study ${study.id}:`, error.message);
        stats.errors++;
      }
    }

    // Final statistics
    console.log('\n📈 Cleanup Results:');
    console.log(`Total studies processed: ${stats.total}`);
    console.log(`Already good (no changes): ${stats.alreadyGood}`);
    console.log(`Fixed double-encoded JSON: ${stats.fixedDoubleEncoded}`);
    console.log(`Set invalid "[object Object]" to NULL: ${stats.setToNull}`);
    console.log(`Errors encountered: ${stats.errors}`);
    
    // Validation query
    const validationResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(metrics_json) as with_data,
        COUNT(*) - COUNT(metrics_json) as null_count
      FROM imaging_studies
    `);
    
    console.log('\n✅ Post-cleanup validation:');
    console.log(`Total studies: ${validationResult.rows[0].total}`);
    console.log(`With metrics_json data: ${validationResult.rows[0].with_data}`);
    console.log(`NULL metrics_json: ${validationResult.rows[0].null_count}`);

    console.log('\n🎉 Metrics JSON cleanup completed successfully!');
    
  } catch (error) {
    console.error('💥 Fatal error during cleanup:', error);
    throw error;
  }
}

// Run the cleanup if called directly
if (require.main === module) {
  fixMetricsJson()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixMetricsJson };