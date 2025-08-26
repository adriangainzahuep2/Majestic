#!/usr/bin/env node

/**
 * Test script to verify metrics_json serialization fixes
 * Creates test data and verifies it's properly stored and retrieved
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testMetricsJsonSerialization() {
  console.log('🧪 Testing metrics_json serialization fixes...');
  
  try {
    // Test data: array of measurement objects
    const testMetrics = [
      { name: 'LDL Cholesterol', value: 95, units: 'mg/dL' },
      { name: 'HDL Cholesterol', value: 55, units: 'mg/dL' }
    ];

    // Insert test study with JSONB data (properly formatted)
    const insertResult = await pool.query(`
      INSERT INTO imaging_studies (
        user_id, linked_system_id, study_type, 
        test_date, ai_summary, metrics_json, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, metrics_json
    `, [
      1, // demo user
      1, // cardiovascular system  
      'lipid_panel_test',
      '2024-01-15',
      'Test lipid panel results',
      JSON.stringify(testMetrics), // PostgreSQL JSONB expects string
      'completed'
    ]);

    const studyId = insertResult.rows[0].id;
    const storedMetrics = insertResult.rows[0].metrics_json;
    
    console.log(`✅ Created test study ID: ${studyId}`);
    console.log('📊 Stored metrics_json type:', typeof storedMetrics);
    console.log('📊 Stored metrics_json content:', JSON.stringify(storedMetrics, null, 2));

    // Verify data integrity
    if (Array.isArray(storedMetrics) && storedMetrics.length === 2) {
      console.log('✅ Data stored correctly as JSONB array');
      
      // Test retrieval for trends processing
      const retrieveResult = await pool.query(`
        SELECT id, metrics_json FROM imaging_studies WHERE id = $1
      `, [studyId]);
      
      const retrieved = retrieveResult.rows[0].metrics_json;
      console.log('📥 Retrieved metrics_json type:', typeof retrieved);
      
      if (typeof retrieved === 'object' && Array.isArray(retrieved)) {
        console.log('✅ Retrieved correctly as JavaScript object');
        
        // Test processing like in getSystemTrends
        for (const measurement of retrieved) {
          if (measurement && measurement.name) {
            console.log(`  📈 Found metric: ${measurement.name} = ${measurement.value} ${measurement.units}`);
          }
        }
        
        console.log('✅ All tests passed! metrics_json serialization is working correctly');
      } else {
        console.error('❌ Retrieved data has wrong type:', typeof retrieved);
      }
      
    } else {
      console.error('❌ Stored data is not the expected array format');
    }

    // Clean up test data
    await pool.query('DELETE FROM imaging_studies WHERE id = $1', [studyId]);
    console.log('🧹 Cleaned up test data');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test if called directly
if (require.main === module) {
  testMetricsJsonSerialization()
    .then(() => {
      console.log('✅ Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testMetricsJsonSerialization };