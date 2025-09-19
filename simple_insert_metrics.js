const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: false
});

async function insertBasicMetrics() {
  try {
    console.log('📊 Inserting basic metrics...');
    
    const userId = 2; // Demo user
    const uploadId = 1; // First upload
    
    // Clear existing metrics
    await pool.query('DELETE FROM metrics WHERE user_id = $1', [userId]);
    console.log('🧹 Cleared existing metrics');
    
    // Simple metrics array
    const metrics = [
      ['HDL Cholesterol', 58, 'mg/dL', 40, 60, 1, 'Normal'],
      ['LDL Cholesterol', 135, 'mg/dL', 0, 100, 1, 'High'],
      ['Total Cholesterol', 210, 'mg/dL', 0, 200, 1, 'High'],
      ['Triglycerides', 165, 'mg/dL', 0, 150, 1, 'High'],
      ['Hemoglobin A1c (HbA1c)', 5.8, '%', 4.0, 5.6, 2, 'High'],
      ['Fasting Glucose', 108, 'mg/dL', 70, 100, 2, 'High'],
      ['Serum Creatinine', 0.9, 'mg/dL', 0.6, 1.2, 3, 'Normal'],
      ['Thyroid Stimulating Hormone (TSH)', 2.1, 'μIU/mL', 0.4, 4.0, 2, 'Normal'],
      ['Hemoglobin', 13.8, 'g/dL', 12.0, 15.5, 5, 'Normal'],
      ['White Blood Cell Count (WBC)', 6.2, '10³/μL', 4.0, 10.0, 5, 'Normal']
    ];
    
    // Insert one by one
    for (const [name, value, unit, min, max, systemId, status] of metrics) {
      try {
        await pool.query(`
          INSERT INTO metrics (
            user_id, upload_id, metric_name, metric_value, units,
            test_date, system_id, status, reference_range_min, reference_range_max, source_type
          ) VALUES ($1, $2, $3, $4, $5, '2024-01-15', $6, $7, $8, $9, 'upload')
        `, [userId, uploadId, name, value, unit, systemId, status, min, max]);
        
        console.log(`✅ ${name}: ${value} ${unit} [${status}]`);
      } catch (error) {
        console.error(`❌ Failed to insert ${name}:`, error.message);
      }
    }
    
    // Verify insertion
    const count = await pool.query('SELECT COUNT(*) FROM metrics WHERE user_id = $1', [userId]);
    console.log(`\n🎉 Successfully inserted ${count.rows[0].count} metrics`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

insertBasicMetrics();
