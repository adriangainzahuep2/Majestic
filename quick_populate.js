const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: false
});

async function quickPopulate() {
  try {
    console.log('🚀 Quick population started...');
    
    // Create/get demo user
    const userResult = await pool.query(`
      INSERT INTO users (email, name, google_id) 
      VALUES ('demo@majestic.com', 'Demo User', 'demo-123')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    
    const userId = userResult.rows[0].id;
    console.log(`👤 Demo user ID: ${userId}`);
    
    // Clear existing data
    await pool.query('DELETE FROM metrics WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM uploads WHERE user_id = $1', [userId]);
    
    // Create upload
    const uploadResult = await pool.query(`
      INSERT INTO uploads (user_id, filename, file_type, processing_status, created_at)
      VALUES ($1, 'test_labs_2024-01-15.pdf', 'lab_report', 'completed', '2024-01-15')
      RETURNING id
    `, [userId]);
    
    const uploadId = uploadResult.rows[0].id;
    console.log(`📁 Upload ID: ${uploadId}`);
    
    // Insert metrics directly
    const metrics = [
      ['HDL Cholesterol', 58, 'mg/dL', 40, 60, 1],
      ['LDL Cholesterol', 135, 'mg/dL', 0, 100, 1],
      ['Total Cholesterol', 210, 'mg/dL', 0, 200, 1],
      ['Triglycerides', 165, 'mg/dL', 0, 150, 1],
      ['Hemoglobin A1c (HbA1c)', 5.8, '%', 4.0, 5.6, 2],
      ['Fasting Glucose', 108, 'mg/dL', 70, 100, 2],
      ['Serum Creatinine', 0.9, 'mg/dL', 0.6, 1.2, 3],
      ['Thyroid Stimulating Hormone (TSH)', 2.1, 'μIU/mL', 0.4, 4.0, 2],
      ['Hemoglobin', 13.8, 'g/dL', 12.0, 15.5, 5],
      ['White Blood Cell Count (WBC)', 6.2, '10³/μL', 4.0, 10.0, 5]
    ];
    
    for (const [name, value, unit, min, max, systemId] of metrics) {
      const status = value < min ? 'Low' : value > max ? 'High' : 'Normal';
      
      await pool.query(`
        INSERT INTO metrics (
          user_id, upload_id, metric_name, metric_value, units,
          test_date, system_id, status, reference_range_min, reference_range_max, source_type
        ) VALUES ($1, $2, $3, $4, $5, '2024-01-15', $6, $7, $8, $9, 'upload')
      `, [userId, uploadId, name, value, unit, systemId, status, min, max]);
    }
    
    console.log(`✅ Inserted ${metrics.length} metrics`);
    
    // Create custom range
    await pool.query(`
      INSERT INTO custom_reference_ranges (
        user_id, metric_name, min_value, max_value, units,
        medical_condition, notes, valid_from
      ) VALUES ($1, 'Hemoglobin A1c (HbA1c)', 4.0, 6.0, '%', 'pregnancy', 'Pregnancy adjusted', '2024-01-01')
      ON CONFLICT (user_id, metric_name, medical_condition, valid_from) DO NOTHING
    `, [userId]);
    
    console.log('🎯 Created custom range');
    
    console.log('\n🎉 SUCCESS! Data populated');
    console.log('📱 Go to http://localhost:5000 and login with Demo Login');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

quickPopulate();
