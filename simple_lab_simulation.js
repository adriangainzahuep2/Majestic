/**
 * Simple Lab Report Simulation (No OpenAI required)
 * This script directly inserts realistic lab data into the database
 * simulating the complete analysis workflow
 */

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Load metrics data for system mapping
const fs = require('fs');
const path = require('path');

let metricsData = [];
try {
  const metricsPath = path.join(__dirname, 'public/data/metrics.json');
  if (fs.existsSync(metricsPath)) {
    metricsData = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  }
} catch (error) {
  console.log('⚠️  Could not load metrics.json, using basic data');
}

// Helper function to find system ID for a metric
function getSystemIdForMetric(metricName) {
  const metric = metricsData.find(m => 
    m.metric.toLowerCase() === metricName.toLowerCase()
  );
  
  // Map system names to IDs (based on common health system categories)
  const systemMap = {
    'Cardiovascular': 1,
    'Endocrine': 2,
    'Renal': 3,
    'Hepatic': 4,
    'Hematologic': 5,
    'Metabolic': 6,
    'Immunologic': 7,
    'Other': 8
  };
  
  return metric ? (systemMap[metric.system] || 8) : 8;
}

// Helper function to calculate metric status
function calculateStatus(value, min, max) {
  const numValue = parseFloat(value);
  if (isNaN(numValue) || min === null || max === null) return 'No reference';
  
  if (numValue < min) return 'Low';
  if (numValue > max) return 'High';
  return 'Normal';
}

// Comprehensive lab data simulation
const comprehensiveLabData = [
  { name: 'HDL Cholesterol', value: 58, unit: 'mg/dL', min: 40, max: 60 },
  { name: 'LDL Cholesterol', value: 135, unit: 'mg/dL', min: 0, max: 100 },
  { name: 'Total Cholesterol', value: 210, unit: 'mg/dL', min: 0, max: 200 },
  { name: 'Triglycerides', value: 165, unit: 'mg/dL', min: 0, max: 150 },
  { name: 'Hemoglobin A1c (HbA1c)', value: 5.8, unit: '%', min: 4.0, max: 5.6 },
  { name: 'Fasting Glucose', value: 108, unit: 'mg/dL', min: 70, max: 100 },
  { name: 'Serum Creatinine', value: 0.9, unit: 'mg/dL', min: 0.6, max: 1.2 },
  { name: 'Blood Urea Nitrogen (BUN)', value: 18, unit: 'mg/dL', min: 7, max: 25 },
  { name: 'Alanine Aminotransferase (ALT)', value: 28, unit: 'U/L', min: 7, max: 35 },
  { name: 'Aspartate Aminotransferase (AST)', value: 22, unit: 'U/L', min: 8, max: 35 },
  { name: 'Thyroid Stimulating Hormone (TSH)', value: 2.1, unit: 'μIU/mL', min: 0.4, max: 4.0 },
  { name: 'C-Reactive Protein (CRP)', value: 1.8, unit: 'mg/L', min: 0, max: 3.0 },
  { name: 'White Blood Cell Count (WBC)', value: 6.2, unit: '10³/μL', min: 4.0, max: 10.0 },
  { name: 'Red Blood Cell Count (RBC)', value: 4.5, unit: '10⁶/μL', min: 4.2, max: 5.4 },
  { name: 'Hemoglobin', value: 13.8, unit: 'g/dL', min: 12.0, max: 15.5 },
  { name: 'Hematocrit', value: 41.2, unit: '%', min: 36.0, max: 46.0 },
  { name: 'Platelet Count', value: 285, unit: '10³/μL', min: 150, max: 450 },
  { name: 'Vitamin D, 25-OH', value: 32, unit: 'ng/mL', min: 30, max: 100 }
];

// Follow-up lab data (slightly different values)
const followUpLabData = [
  { name: 'HDL Cholesterol', value: 62, unit: 'mg/dL', min: 40, max: 60 },
  { name: 'LDL Cholesterol', value: 125, unit: 'mg/dL', min: 0, max: 100 },
  { name: 'Total Cholesterol', value: 198, unit: 'mg/dL', min: 0, max: 200 },
  { name: 'Triglycerides', value: 142, unit: 'mg/dL', min: 0, max: 150 },
  { name: 'Hemoglobin A1c (HbA1c)', value: 5.6, unit: '%', min: 4.0, max: 5.6 },
  { name: 'Fasting Glucose', value: 95, unit: 'mg/dL', min: 70, max: 100 },
  { name: 'Serum Creatinine', value: 0.8, unit: 'mg/dL', min: 0.6, max: 1.2 },
  { name: 'Thyroid Stimulating Hormone (TSH)', value: 1.8, unit: 'μIU/mL', min: 0.4, max: 4.0 },
  { name: 'Vitamin D, 25-OH', value: 38, unit: 'ng/mL', min: 30, max: 100 }
];

// Pregnancy-specific lab data
const pregnancyLabData = [
  { name: 'Hemoglobin A1c (HbA1c)', value: 5.9, unit: '%', min: 4.0, max: 6.0 }, // Custom range
  { name: 'Fasting Glucose', value: 92, unit: 'mg/dL', min: 70, max: 95 }, // Custom range
  { name: 'Hemoglobin', value: 11.5, unit: 'g/dL', min: 11.0, max: 13.0 }, // Custom range
  { name: 'Hematocrit', value: 34.8, unit: '%', min: 33.0, max: 39.0 },
  { name: 'Iron', value: 85, unit: 'μg/dL', min: 60, max: 170 },
  { name: 'Ferritin', value: 45, unit: 'ng/mL', min: 15, max: 200 }
];

async function createSampleCustomRanges(userId) {
  const client = await pool.connect();
  
  try {
    console.log('🎯 Creating sample custom reference ranges...');
    
    const customRanges = [
      {
        metric_name: 'Hemoglobin A1c (HbA1c)',
        min_value: 4.0,
        max_value: 6.0,
        units: '%',
        condition: 'pregnancy',
        details: null,
        notes: 'Adjusted range for gestational diabetes monitoring',
        valid_from: '2024-01-01',
        valid_until: '2024-10-01'
      },
      {
        metric_name: 'Fasting Glucose',
        min_value: 70,
        max_value: 95,
        units: 'mg/dL',
        condition: 'pregnancy',
        details: null,
        notes: 'Stricter glucose control during pregnancy',
        valid_from: '2024-01-01',
        valid_until: '2024-10-01'
      },
      {
        metric_name: 'Hemoglobin',
        min_value: 11.0,
        max_value: 13.0,
        units: 'g/dL',
        condition: 'pregnancy',
        details: null,
        notes: 'Adjusted for pregnancy physiological changes',
        valid_from: '2024-01-01',
        valid_until: '2024-10-01'
      },
      {
        metric_name: 'Serum Creatinine',
        min_value: 0.8,
        max_value: 1.4,
        units: 'mg/dL',
        condition: 'age_related',
        details: null,
        notes: 'Adjusted for patients over 65 years',
        valid_from: '2024-01-01',
        valid_until: null
      }
    ];
    
    for (const range of customRanges) {
      await client.query(`
        INSERT INTO custom_reference_ranges (
          user_id,
          metric_name,
          min_value,
          max_value,
          units,
          medical_condition,
          condition_details,
          notes,
          valid_from,
          valid_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id, metric_name, medical_condition, valid_from) 
        DO NOTHING
      `, [
        userId,
        range.metric_name,
        range.min_value,
        range.max_value,
        range.units,
        range.condition,
        range.details,
        range.notes,
        range.valid_from,
        range.valid_until
      ]);
    }
    
    console.log(`✅ Created ${customRanges.length} custom reference ranges`);
    
  } catch (error) {
    console.error('❌ Error creating custom ranges:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function insertLabData(userId, labData, testDate, filename) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`🔬 Inserting lab data: ${filename}`);
    console.log(`📊 Processing ${labData.length} metrics for date ${testDate}...`);
    
    // Create upload record
    const uploadResult = await client.query(`
      INSERT INTO uploads (
        user_id, 
        filename, 
        file_type,
        processing_status,
        upload_date,
        file_size
      ) VALUES ($1, $2, 'lab_report', 'completed', $3, 1024)
      RETURNING id
    `, [userId, filename, testDate]);
    
    const uploadId = uploadResult.rows[0].id;
    console.log(`📄 Created upload record with ID: ${uploadId}`);
    
    // Insert metrics
    let insertedCount = 0;
    for (const metric of labData) {
      const systemId = getSystemIdForMetric(metric.name);
      const status = calculateStatus(metric.value, metric.min, metric.max);
      
      await client.query(`
        INSERT INTO metrics (
          user_id,
          upload_id,
          metric_name,
          metric_value,
          units,
          test_date,
          system_id,
          status,
          reference_range_min,
          reference_range_max,
          source_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'upload')
      `, [
        userId,
        uploadId,
        metric.name,
        metric.value,
        metric.unit,
        testDate,
        systemId,
        status,
        metric.min,
        metric.max
      ]);
      
      insertedCount++;
    }
    
    await client.query('COMMIT');
    console.log(`✅ Successfully inserted ${insertedCount} metrics`);
    
    return { uploadId, insertedCount };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error inserting lab data:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function createPendingSuggestions(userId) {
  const client = await pool.connect();
  
  try {
    console.log('⏳ Creating sample pending metric suggestions...');
    
    // Create an upload for unmatched metrics
    const uploadResult = await client.query(`
      INSERT INTO uploads (
        user_id, 
        filename, 
        file_type,
        processing_status,
        upload_date,
        file_size
      ) VALUES ($1, 'lab_with_synonyms_2024-01-22.pdf', 'lab_report', 'completed', '2024-01-22', 1024)
      RETURNING id
    `, [userId]);
    
    const uploadId = uploadResult.rows[0].id;
    
    // Sample unmatched metrics and AI suggestions
    const unmatchedMetrics = [
      { name: 'Chol HDL', value: 55, unit: 'mg/dL' },
      { name: 'Glucosa en ayunas', value: 115, unit: 'mg/dL' },
      { name: 'Creat', value: 1.1, unit: 'mg/dL' }
    ];
    
    const aiSuggestions = {
      suggestions: [
        {
          original_name: 'Chol HDL',
          suggested_matches: [
            {
              standard_name: 'HDL Cholesterol',
              confidence: 0.95,
              reason: 'Common abbreviation for HDL Cholesterol'
            }
          ]
        },
        {
          original_name: 'Glucosa en ayunas',
          suggested_matches: [
            {
              standard_name: 'Fasting Glucose',
              confidence: 0.92,
              reason: 'Spanish term for Fasting Glucose'
            }
          ]
        },
        {
          original_name: 'Creat',
          suggested_matches: [
            {
              standard_name: 'Serum Creatinine',
              confidence: 0.88,
              reason: 'Common abbreviation for Serum Creatinine'
            }
          ]
        }
      ]
    };
    
    await client.query(`
      INSERT INTO pending_metric_suggestions (
        user_id,
        upload_id,
        unmatched_metrics,
        ai_suggestions,
        test_date,
        status
      ) VALUES ($1, $2, $3, $4, '2024-01-22', 'pending')
    `, [
      userId,
      uploadId,
      JSON.stringify(unmatchedMetrics),
      JSON.stringify(aiSuggestions)
    ]);
    
    console.log(`✅ Created pending suggestions for ${unmatchedMetrics.length} unmatched metrics`);
    
  } catch (error) {
    console.error('❌ Error creating pending suggestions:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function runSimulation() {
  try {
    console.log('🚀 Starting Simple Lab Data Simulation...\n');
    
    // Get demo user
    const userResult = await pool.query(`
      SELECT id FROM users WHERE email = 'demo@majestic.com'
      LIMIT 1
    `);
    
    if (userResult.rows.length === 0) {
      console.log('❌ Demo user not found. Please run demo login first.');
      return;
    }
    
    const userId = userResult.rows[0].id;
    console.log(`👤 Using demo user ID: ${userId}\n`);
    
    // 1. Create custom reference ranges
    await createSampleCustomRanges(userId);
    console.log('');
    
    // 2. Insert comprehensive lab data (older)
    const result1 = await insertLabData(
      userId,
      comprehensiveLabData,
      '2024-01-15',
      'comprehensive_metabolic_panel_2024-01-15.pdf'
    );
    console.log('');
    
    // 3. Insert follow-up lab data (newer) 
    const result2 = await insertLabData(
      userId,
      followUpLabData,
      '2024-01-28',
      'follow_up_labs_2024-01-28.pdf'
    );
    console.log('');
    
    // 4. Insert pregnancy-specific lab data
    const result3 = await insertLabData(
      userId,
      pregnancyLabData,
      '2024-01-25',
      'prenatal_labs_2024-01-25.pdf'
    );
    console.log('');
    
    // 5. Create some pending metric suggestions for testing
    await createPendingSuggestions(userId);
    console.log('');
    
    // Summary
    console.log('📊 SIMULATION SUMMARY:');
    console.log('========================');
    console.log(`✅ Total uploads processed: 4`);
    console.log(`📈 Total metrics added: ${result1.insertedCount + result2.insertedCount + result3.insertedCount}`);
    console.log(`🎯 Custom ranges created: 4`);
    console.log(`⏳ Pending suggestions: 3`);
    console.log('');
    console.log('🎉 Simulation completed successfully!');
    console.log('');
    console.log('📱 You can now:');
    console.log('   1. View the dashboard with populated metrics and trends');
    console.log('   2. Check Profile → Custom Reference Ranges');
    console.log('   3. Review pending metric suggestions');
    console.log('   4. See how custom ranges affect metric evaluation');
    console.log('   5. Explore different time periods in the trends view');
    
  } catch (error) {
    console.error('❌ Simulation failed:', error);
  } finally {
    await pool.end();
  }
}

// Run simulation if called directly
if (require.main === module) {
  runSimulation().catch(console.error);
}

module.exports = {
  runSimulation,
  insertLabData,
  createSampleCustomRanges,
  createPendingSuggestions
};
