// Test script to verify the lab results pipeline fix
const fs = require('fs');
const path = require('path');

// Import the fixed ingestion service
const ingestionService = require('./services/ingestionService');

async function testLabPipeline() {
  console.log('🧪 Testing Lab Results Pipeline Fix...\n');

  // Create a fake file object that mimics what would come from multer
  const testLabContent = `COMPREHENSIVE METABOLIC PANEL
Patient: Test User
Date: 08/21/2025

LIPID PANEL:
LDL Cholesterol: 150 mg/dL (Reference: <100)
HDL Cholesterol: 45 mg/dL (Reference: >40)
Triglycerides: 180 mg/dL (Reference: <150)

DIABETES:
HbA1c: 6.2% (Reference: <5.7%)
Fasting Glucose: 110 mg/dL (Reference: 70-100)

LIVER:
ALT: 35 U/L (Reference: 7-40)

KIDNEY:
Creatinine: 1.1 mg/dL (Reference: 0.6-1.2)

THYROID:
TSH: 2.5 mIU/L (Reference: 0.4-4.0)

INFLAMMATION:
hs-CRP: 3.2 mg/L (Reference: <3.0)`;

  const fakeFile = {
    originalname: 'test_lab_report.txt',
    mimetype: 'text/plain',
    size: testLabContent.length,
    base64Data: Buffer.from(testLabContent).toString('base64')
  };

  try {
    // Test the pipeline with demo user ID (1) and today's date
    const result = await ingestionService.processFile({
      userId: 1,
      file: fakeFile,
      testDate: '2025-08-21'
    });

    console.log('✅ Pipeline Processing Result:');
    console.log(JSON.stringify(result, null, 2));

    // Now check if metrics were saved correctly by querying database
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    console.log('\n📊 Checking saved metrics in database...');
    const metricsQuery = await pool.query(`
      SELECT m.metric_name, m.system_id, hs.name as system_name, m.metric_value, m.metric_unit
      FROM metrics m
      JOIN health_systems hs ON m.system_id = hs.id
      WHERE m.user_id = 1
      ORDER BY m.system_id, m.metric_name
    `);

    if (metricsQuery.rows.length > 0) {
      console.log('\n✅ Metrics successfully saved with system mappings:');
      metricsQuery.rows.forEach(metric => {
        console.log(`  • ${metric.metric_name}: ${metric.metric_value} ${metric.metric_unit || ''} → System ${metric.system_id} (${metric.system_name})`);
      });
    } else {
      console.log('\n❌ No metrics found in database');
    }

    await pool.end();

  } catch (error) {
    console.error('❌ Pipeline test failed:', error);
  }
}

// Run the test
testLabPipeline().catch(console.error);