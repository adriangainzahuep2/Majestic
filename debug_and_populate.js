/**
 * Debug and Populate Script
 * This script checks the current state and populates data step by step
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: false
});

async function checkDatabaseState() {
  try {
    console.log('🔍 Checking database state...\n');
    
    // Check if demo user exists
    const userResult = await pool.query(`
      SELECT id, email, created_at FROM users 
      WHERE email LIKE '%demo%' OR email LIKE '%test%'
      ORDER BY created_at DESC
    `);
    
    console.log('👥 Users found:');
    if (userResult.rows.length === 0) {
      console.log('   ❌ No demo/test users found');
      return null;
    } else {
      userResult.rows.forEach(user => {
        console.log(`   ✅ ID: ${user.id}, Email: ${user.email}, Created: ${user.created_at}`);
      });
    }
    
    const userId = userResult.rows[0].id;
    
    // Check existing metrics
    const metricsResult = await pool.query(`
      SELECT COUNT(*) as count, MIN(test_date) as earliest, MAX(test_date) as latest
      FROM metrics WHERE user_id = $1
    `, [userId]);
    
    console.log(`\n📊 Existing metrics for user ${userId}:`);
    console.log(`   Count: ${metricsResult.rows[0].count}`);
    console.log(`   Date range: ${metricsResult.rows[0].earliest} to ${metricsResult.rows[0].latest}`);
    
    // Check uploads
    const uploadsResult = await pool.query(`
      SELECT COUNT(*) as count FROM uploads WHERE user_id = $1
    `, [userId]);
    
    console.log(`\n📁 Uploads: ${uploadsResult.rows[0].count}`);
    
    // Check custom ranges
    const rangesResult = await pool.query(`
      SELECT COUNT(*) as count FROM custom_reference_ranges WHERE user_id = $1
    `, [userId]);
    
    console.log(`🎯 Custom ranges: ${rangesResult.rows[0].count}`);
    
    return userId;
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    return null;
  }
}

async function createDemoUser() {
  try {
    console.log('\n👤 Creating demo user...');
    
    const result = await pool.query(`
      INSERT INTO users (
        email, 
        name, 
        google_id, 
        created_at
      ) VALUES (
        'demo@majestic.com', 
        'Demo User', 
        'demo-user-123', 
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name
      RETURNING id, email
    `);
    
    console.log(`✅ Demo user created/updated: ID ${result.rows[0].id}`);
    return result.rows[0].id;
    
  } catch (error) {
    console.error('❌ Failed to create demo user:', error.message);
    return null;
  }
}

async function populateWithTestData(userId) {
  try {
    console.log(`\n📊 Populating test data for user ${userId}...`);
    
    // Clear existing data
    await pool.query('DELETE FROM metrics WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM uploads WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM custom_reference_ranges WHERE user_id = $1', [userId]);
    
    console.log('🧹 Cleared existing data');
    
    // Create uploads first
    const upload1 = await pool.query(`
      INSERT INTO uploads (
        user_id, filename, file_type, processing_status, upload_date, file_size
      ) VALUES ($1, 'comprehensive_labs_2024-01-15.pdf', 'lab_report', 'completed', '2024-01-15', 1024)
      RETURNING id
    `, [userId]);
    
    const upload2 = await pool.query(`
      INSERT INTO uploads (
        user_id, filename, file_type, processing_status, upload_date, file_size
      ) VALUES ($1, 'follow_up_labs_2024-01-28.pdf', 'lab_report', 'completed', '2024-01-28', 1024)
      RETURNING id
    `, [userId]);
    
    console.log(`📁 Created uploads: ${upload1.rows[0].id}, ${upload2.rows[0].id}`);
    
    // Insert comprehensive lab data
    const labData = [
      // Cardiovascular system (system_id = 1)
      { name: 'HDL Cholesterol', value: 58, unit: 'mg/dL', min: 40, max: 60, system: 1 },
      { name: 'LDL Cholesterol', value: 135, unit: 'mg/dL', min: 0, max: 100, system: 1 },
      { name: 'Total Cholesterol', value: 210, unit: 'mg/dL', min: 0, max: 200, system: 1 },
      { name: 'Triglycerides', value: 165, unit: 'mg/dL', min: 0, max: 150, system: 1 },
      
      // Endocrine system (system_id = 2)
      { name: 'Hemoglobin A1c (HbA1c)', value: 5.8, unit: '%', min: 4.0, max: 5.6, system: 2 },
      { name: 'Fasting Glucose', value: 108, unit: 'mg/dL', min: 70, max: 100, system: 2 },
      { name: 'Thyroid Stimulating Hormone (TSH)', value: 2.1, unit: 'μIU/mL', min: 0.4, max: 4.0, system: 2 },
      
      // Renal system (system_id = 3)
      { name: 'Serum Creatinine', value: 0.9, unit: 'mg/dL', min: 0.6, max: 1.2, system: 3 },
      { name: 'Blood Urea Nitrogen (BUN)', value: 18, unit: 'mg/dL', min: 7, max: 25, system: 3 },
      
      // Hepatic system (system_id = 4)
      { name: 'Alanine Aminotransferase (ALT)', value: 28, unit: 'U/L', min: 7, max: 35, system: 4 },
      { name: 'Aspartate Aminotransferase (AST)', value: 22, unit: 'U/L', min: 8, max: 35, system: 4 },
      
      // Hematologic system (system_id = 5)
      { name: 'White Blood Cell Count (WBC)', value: 6.2, unit: '10³/μL', min: 4.0, max: 10.0, system: 5 },
      { name: 'Red Blood Cell Count (RBC)', value: 4.5, unit: '10⁶/μL', min: 4.2, max: 5.4, system: 5 },
      { name: 'Hemoglobin', value: 13.8, unit: 'g/dL', min: 12.0, max: 15.5, system: 5 },
      { name: 'Hematocrit', value: 41.2, unit: '%', min: 36.0, max: 46.0, system: 5 },
      { name: 'Platelet Count', value: 285, unit: '10³/μL', min: 150, max: 450, system: 5 },
      
      // Other
      { name: 'C-Reactive Protein (CRP)', value: 1.8, unit: 'mg/L', min: 0, max: 3.0, system: 8 },
      { name: 'Vitamin D, 25-OH', value: 32, unit: 'ng/mL', min: 30, max: 100, system: 8 }
    ];
    
    // Insert first set of metrics (older date)
    let insertedCount = 0;
    for (const metric of labData) {
      const status = metric.value < metric.min ? 'Low' : 
                    metric.value > metric.max ? 'High' : 'Normal';
      
      await pool.query(`
        INSERT INTO metrics (
          user_id, upload_id, metric_name, metric_value, units, 
          test_date, system_id, status, reference_range_min, reference_range_max, source_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'upload')
      `, [
        userId, upload1.rows[0].id, metric.name, metric.value, metric.unit,
        '2024-01-15', metric.system, status, metric.min, metric.max
      ]);
      insertedCount++;
    }
    
    // Insert second set (follow-up, newer date, some improved values)
    const followUpData = [
      { name: 'HDL Cholesterol', value: 62, unit: 'mg/dL', min: 40, max: 60, system: 1 },
      { name: 'LDL Cholesterol', value: 125, unit: 'mg/dL', min: 0, max: 100, system: 1 },
      { name: 'Total Cholesterol', value: 198, unit: 'mg/dL', min: 0, max: 200, system: 1 },
      { name: 'Hemoglobin A1c (HbA1c)', value: 5.6, unit: '%', min: 4.0, max: 5.6, system: 2 },
      { name: 'Fasting Glucose', value: 95, unit: 'mg/dL', min: 70, max: 100, system: 2 },
      { name: 'Serum Creatinine', value: 0.8, unit: 'mg/dL', min: 0.6, max: 1.2, system: 3 }
    ];
    
    for (const metric of followUpData) {
      const status = metric.value < metric.min ? 'Low' : 
                    metric.value > metric.max ? 'High' : 'Normal';
      
      await pool.query(`
        INSERT INTO metrics (
          user_id, upload_id, metric_name, metric_value, units, 
          test_date, system_id, status, reference_range_min, reference_range_max, source_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'upload')
      `, [
        userId, upload2.rows[0].id, metric.name, metric.value, metric.unit,
        '2024-01-28', metric.system, status, metric.min, metric.max
      ]);
      insertedCount++;
    }
    
    console.log(`✅ Inserted ${insertedCount} metrics`);
    
    // Create custom reference ranges
    const customRanges = [
      {
        metric_name: 'Hemoglobin A1c (HbA1c)',
        min_value: 4.0, max_value: 6.0, units: '%',
        condition: 'pregnancy', notes: 'Adjusted for gestational diabetes',
        valid_from: '2024-01-01', valid_until: '2024-10-01'
      },
      {
        metric_name: 'Fasting Glucose',
        min_value: 70, max_value: 95, units: 'mg/dL',
        condition: 'pregnancy', notes: 'Stricter glucose control during pregnancy',
        valid_from: '2024-01-01', valid_until: '2024-10-01'
      }
    ];
    
    for (const range of customRanges) {
      await pool.query(`
        INSERT INTO custom_reference_ranges (
          user_id, metric_name, min_value, max_value, units,
          medical_condition, notes, valid_from, valid_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId, range.metric_name, range.min_value, range.max_value, range.units,
        range.condition, range.notes, range.valid_from, range.valid_until
      ]);
    }
    
    console.log(`🎯 Created ${customRanges.length} custom reference ranges`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Failed to populate data:', error.message);
    return false;
  }
}

async function main() {
  try {
    console.log('🔧 DEBUG AND POPULATE SCRIPT\n');
    console.log('===============================\n');
    
    // Check current state
    let userId = await checkDatabaseState();
    
    if (!userId) {
      console.log('\n👤 No demo user found, creating one...');
      userId = await createDemoUser();
    }
    
    if (!userId) {
      console.log('❌ Failed to get/create demo user');
      return;
    }
    
    // Populate with test data
    const success = await populateWithTestData(userId);
    
    if (success) {
      console.log('\n🎉 SUCCESS! Data populated successfully');
      console.log('\n📱 You can now:');
      console.log('   1. Refresh your browser at http://localhost:5000');
      console.log('   2. Login with Demo Login');
      console.log('   3. View Dashboard with populated metrics');
      console.log('   4. Check Profile → Custom Reference Ranges');
      console.log('   5. Explore trends and different time periods');
    } else {
      console.log('\n❌ Failed to populate data');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, checkDatabaseState, createDemoUser, populateWithTestData };
