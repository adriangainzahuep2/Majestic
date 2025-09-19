/**
 * Lab Report Analysis Simulation
 * This script simulates the complete flow of uploading and processing a lab report
 * using mock LLM responses to populate the application with realistic data
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Mock LLM response for lab report analysis
const mockLabReportAnalysis = {
  "file_type": "lab_report",
  "confidence": 0.95,
  "analysis": {
    "patient_info": {
      "name": "Demo User",
      "age": 35,
      "sex": "Female",
      "mrn": "12345678"
    },
    "test_date": "2024-01-15",
    "lab_facility": "Central Medical Laboratory",
    "doctor": "Dr. Sarah Johnson, MD",
    "extracted_metrics": [
      {
        "name": "HDL Cholesterol",
        "value": 58,
        "unit": "mg/dL",
        "reference_range": "40-60 mg/dL",
        "flag": "",
        "confidence": 0.98
      },
      {
        "name": "LDL Cholesterol", 
        "value": 135,
        "unit": "mg/dL",
        "reference_range": "<100 mg/dL",
        "flag": "H",
        "confidence": 0.97
      },
      {
        "name": "Total Cholesterol",
        "value": 210,
        "unit": "mg/dL", 
        "reference_range": "<200 mg/dL",
        "flag": "H",
        "confidence": 0.99
      },
      {
        "name": "Triglycerides",
        "value": 165,
        "unit": "mg/dL",
        "reference_range": "<150 mg/dL", 
        "flag": "H",
        "confidence": 0.96
      },
      {
        "name": "Hemoglobin A1c (HbA1c)",
        "value": 5.8,
        "unit": "%",
        "reference_range": "4.0-5.6%",
        "flag": "H", 
        "confidence": 0.99
      },
      {
        "name": "Fasting Glucose",
        "value": 108,
        "unit": "mg/dL",
        "reference_range": "70-100 mg/dL",
        "flag": "H",
        "confidence": 0.98
      },
      {
        "name": "Serum Creatinine",
        "value": 0.9,
        "unit": "mg/dL",
        "reference_range": "0.6-1.2 mg/dL",
        "flag": "",
        "confidence": 0.97
      },
      {
        "name": "Blood Urea Nitrogen (BUN)",
        "value": 18,
        "unit": "mg/dL",
        "reference_range": "7-25 mg/dL",
        "flag": "",
        "confidence": 0.95
      },
      {
        "name": "Alanine Aminotransferase (ALT)",
        "value": 28,
        "unit": "U/L",
        "reference_range": "7-35 U/L",
        "flag": "",
        "confidence": 0.96
      },
      {
        "name": "Aspartate Aminotransferase (AST)",
        "value": 22,
        "unit": "U/L", 
        "reference_range": "8-35 U/L",
        "flag": "",
        "confidence": 0.94
      },
      {
        "name": "Thyroid Stimulating Hormone (TSH)",
        "value": 2.1,
        "unit": "μIU/mL",
        "reference_range": "0.4-4.0 μIU/mL",
        "flag": "",
        "confidence": 0.97
      },
      {
        "name": "C-Reactive Protein (CRP)",
        "value": 1.8,
        "unit": "mg/L",
        "reference_range": "<3.0 mg/L",
        "flag": "",
        "confidence": 0.93
      },
      {
        "name": "White Blood Cell Count (WBC)",
        "value": 6.2,
        "unit": "10³/μL",
        "reference_range": "4.0-10.0 10³/μL",
        "flag": "",
        "confidence": 0.98
      },
      {
        "name": "Red Blood Cell Count (RBC)", 
        "value": 4.5,
        "unit": "10⁶/μL",
        "reference_range": "4.2-5.4 10⁶/μL",
        "flag": "",
        "confidence": 0.97
      },
      {
        "name": "Hemoglobin",
        "value": 13.8,
        "unit": "g/dL",
        "reference_range": "12.0-15.5 g/dL",
        "flag": "",
        "confidence": 0.99
      },
      {
        "name": "Hematocrit",
        "value": 41.2,
        "unit": "%",
        "reference_range": "36.0-46.0%",
        "flag": "",
        "confidence": 0.98
      },
      {
        "name": "Platelet Count",
        "value": 285,
        "unit": "10³/μL",
        "reference_range": "150-450 10³/μL",
        "flag": "",
        "confidence": 0.96
      },
      {
        "name": "Vitamin D, 25-OH",
        "value": 32,
        "unit": "ng/mL",
        "reference_range": "30-100 ng/mL",
        "flag": "",
        "confidence": 0.95
      }
    ],
    "summary": {
      "total_metrics": 18,
      "abnormal_metrics": 4,
      "systems_affected": ["Cardiovascular", "Endocrine"],
      "key_findings": [
        "Elevated cholesterol levels indicating cardiovascular risk",
        "Slightly elevated HbA1c suggesting prediabetic state", 
        "Elevated fasting glucose consistent with HbA1c findings",
        "Other metabolic markers within normal range"
      ],
      "recommendations": [
        "Lifestyle modifications for cholesterol management",
        "Diabetes screening and monitoring",
        "Follow-up with primary care physician",
        "Consider cardiology consultation"
      ]
    }
  }
};

// Mock metrics with unmatched names for synonym testing
const mockLabReportWithSynonyms = {
  "file_type": "lab_report",
  "confidence": 0.94,
  "analysis": {
    "patient_info": {
      "name": "Demo User",
      "age": 35,
      "sex": "Female"
    },
    "test_date": "2024-01-20",
    "lab_facility": "Regional Health Lab",
    "extracted_metrics": [
      {
        "name": "Chol HDL", // Synonym for HDL Cholesterol
        "value": 55,
        "unit": "mg/dL",
        "confidence": 0.96
      },
      {
        "name": "Chol LDL", // Synonym for LDL Cholesterol
        "value": 142,
        "unit": "mg/dL",
        "confidence": 0.95
      },
      {
        "name": "HbA1c", // Synonym for Hemoglobin A1c
        "value": 6.1,
        "unit": "%",
        "confidence": 0.98
      },
      {
        "name": "Glucosa en ayunas", // Spanish synonym for Fasting Glucose
        "value": 115,
        "unit": "mg/dL",
        "confidence": 0.93
      },
      {
        "name": "TSH", // Synonym for Thyroid Stimulating Hormone
        "value": 3.2,
        "unit": "μIU/mL",
        "confidence": 0.97
      },
      {
        "name": "Creat", // Synonym for Serum Creatinine
        "value": 1.1,
        "unit": "mg/dL",
        "confidence": 0.94
      },
      {
        "name": "Vit D", // Synonym for Vitamin D
        "value": 28,
        "unit": "ng/mL",
        "confidence": 0.92
      }
    ],
    "summary": {
      "total_metrics": 7,
      "abnormal_metrics": 3,
      "note": "This report contains metric names that will test the synonym matching system"
    }
  }
};

// Mock pregnancy-specific lab report
const mockPregnancyLabReport = {
  "file_type": "lab_report",
  "confidence": 0.96,
  "analysis": {
    "patient_info": {
      "name": "Demo User",
      "age": 28,
      "sex": "Female",
      "pregnancy_status": "Second trimester (20 weeks)"
    },
    "test_date": "2024-01-25",
    "lab_facility": "Women's Health Center",
    "doctor": "Dr. Maria Rodriguez, OB/GYN",
    "extracted_metrics": [
      {
        "name": "Hemoglobin A1c (HbA1c)",
        "value": 5.9,
        "unit": "%",
        "reference_range": "4.0-6.0% (pregnancy adjusted)",
        "flag": "",
        "confidence": 0.99,
        "note": "Within pregnancy-adjusted range"
      },
      {
        "name": "Fasting Glucose",
        "value": 92,
        "unit": "mg/dL", 
        "reference_range": "70-95 mg/dL (pregnancy)",
        "flag": "",
        "confidence": 0.98
      },
      {
        "name": "Hemoglobin",
        "value": 11.5,
        "unit": "g/dL",
        "reference_range": "11.0-13.0 g/dL (pregnancy)",
        "flag": "",
        "confidence": 0.97
      },
      {
        "name": "Hematocrit",
        "value": 34.8,
        "unit": "%",
        "reference_range": "33.0-39.0% (pregnancy)",
        "flag": "",
        "confidence": 0.96
      },
      {
        "name": "Iron",
        "value": 85,
        "unit": "μg/dL",
        "reference_range": "60-170 μg/dL",
        "flag": "",
        "confidence": 0.94
      },
      {
        "name": "Ferritin",
        "value": 45,
        "unit": "ng/mL",
        "reference_range": "15-200 ng/mL",
        "flag": "",
        "confidence": 0.93
      }
    ],
    "summary": {
      "total_metrics": 6,
      "abnormal_metrics": 0,
      "pregnancy_specific": true,
      "key_findings": [
        "All values within pregnancy-adjusted normal ranges",
        "Good glycemic control for gestational period",
        "Adequate iron status"
      ]
    }
  }
};

async function simulateLabReportUpload(userId, reportData, filename = "mock_lab_report.pdf") {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`🔬 Simulating lab report upload: ${filename}`);
    console.log(`📊 Processing ${reportData.analysis.extracted_metrics.length} metrics...`);
    
    // 1. Create upload record
    const uploadResult = await client.query(`
      INSERT INTO uploads (
        user_id, 
        filename, 
        file_type,
        processing_status,
        upload_date,
        file_size
      ) VALUES ($1, $2, $3, 'completed', CURRENT_TIMESTAMP, $4)
      RETURNING id
    `, [userId, filename, 'lab_report', 1024]);
    
    const uploadId = uploadResult.rows[0].id;
    console.log(`📄 Created upload record with ID: ${uploadId}`);
    
    // 2. Save AI analysis log
    await client.query(`
      INSERT INTO ai_outputs_log (
        user_id,
        upload_id, 
        output_type,
        model_used,
        prompt_tokens,
        completion_tokens,
        total_cost,
        response_data,
        confidence_score
      ) VALUES ($1, $2, 'lab_analysis', 'gpt-4o-mock', 1500, 800, 0.02, $3, $4)
    `, [userId, uploadId, JSON.stringify(reportData), reportData.confidence]);
    
    // 3. Process metrics with synonym system simulation
    const ingestionService = require('./services/ingestionService');
    const processedResults = await ingestionService.processMetricsForSimulation(
      reportData.analysis.extracted_metrics,
      { uploadId, testDate: reportData.analysis.test_date }
    );
    
    console.log(`✅ Processed metrics:`);
    console.log(`   - Exact matches: ${processedResults.exact_matches.length}`);
    console.log(`   - Unmatched: ${processedResults.unmatched_metrics.length}`);
    console.log(`   - AI suggestions: ${processedResults.ai_suggestions.length}`);
    
    // 4. Save exact matches to metrics table
    for (const match of processedResults.exact_matches) {
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
        match.standard_name,
        match.value,
        match.standard_unit,
        reportData.analysis.test_date,
        match.system_id,
        match.status,
        match.range_min,
        match.range_max
      ]);
    }
    
    // 5. Save unmatched metrics for user review (if any)
    if (processedResults.unmatched_metrics.length > 0) {
      await client.query(`
        INSERT INTO pending_metric_suggestions (
          user_id,
          upload_id,
          unmatched_metrics,
          ai_suggestions,
          test_date,
          status
        ) VALUES ($1, $2, $3, $4, $5, 'pending')
      `, [
        userId,
        uploadId,
        JSON.stringify(processedResults.unmatched_metrics),
        JSON.stringify({ suggestions: processedResults.ai_suggestions }),
        reportData.analysis.test_date
      ]);
      
      console.log(`⏳ Created ${processedResults.unmatched_metrics.length} pending suggestions for user review`);
    }
    
    await client.query('COMMIT');
    console.log(`🎉 Successfully simulated lab report processing!`);
    
    return {
      uploadId,
      exact_matches: processedResults.exact_matches.length,
      pending_suggestions: processedResults.unmatched_metrics.length,
      total_metrics: reportData.analysis.extracted_metrics.length
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during simulation:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function createSampleCustomRanges(userId) {
  const client = await pool.connect();
  
  try {
    console.log('🎯 Creating sample custom reference ranges...');
    
    // Pregnancy-adjusted ranges
    const pregnancyRanges = [
      {
        metric_name: 'Hemoglobin A1c (HbA1c)',
        min_value: 4.0,
        max_value: 6.0,
        units: '%',
        condition: 'pregnancy',
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
        notes: 'Adjusted for pregnancy physiological changes',
        valid_from: '2024-01-01',
        valid_until: '2024-10-01'
      }
    ];
    
    // Age-related adjustments
    const ageRelatedRanges = [
      {
        metric_name: 'Serum Creatinine',
        min_value: 0.8,
        max_value: 1.4,
        units: 'mg/dL',
        condition: 'age_related',
        notes: 'Adjusted for patients over 65 years',
        valid_from: '2024-01-01',
        valid_until: null
      }
    ];
    
    const allRanges = [...pregnancyRanges, ...ageRelatedRanges];
    
    for (const range of allRanges) {
      await client.query(`
        INSERT INTO custom_reference_ranges (
          user_id,
          metric_name,
          min_value,
          max_value,
          units,
          medical_condition,
          notes,
          valid_from,
          valid_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, metric_name, medical_condition, valid_from) 
        DO NOTHING
      `, [
        userId,
        range.metric_name,
        range.min_value,
        range.max_value,
        range.units,
        range.condition,
        range.notes,
        range.valid_from,
        range.valid_until
      ]);
    }
    
    console.log(`✅ Created ${allRanges.length} custom reference ranges`);
    
  } catch (error) {
    console.error('❌ Error creating custom ranges:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function runSimulation() {
  try {
    console.log('🚀 Starting Lab Report Analysis Simulation...\n');
    
    // Get or create demo user
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
    
    // Create sample custom ranges first
    await createSampleCustomRanges(userId);
    console.log('');
    
    // Simulate multiple lab reports
    console.log('📋 Simulating lab report uploads...\n');
    
    // 1. Standard comprehensive lab report
    const result1 = await simulateLabReportUpload(
      userId, 
      mockLabReportAnalysis, 
      "comprehensive_metabolic_panel_2024-01-15.pdf"
    );
    console.log('');
    
    // 2. Report with synonym testing
    const result2 = await simulateLabReportUpload(
      userId,
      mockLabReportWithSynonyms,
      "lab_results_synonyms_2024-01-20.pdf"
    );
    console.log('');
    
    // 3. Pregnancy-specific report
    const result3 = await simulateLabReportUpload(
      userId,
      mockPregnancyLabReport,
      "prenatal_labs_2024-01-25.pdf"
    );
    console.log('');
    
    // Summary
    console.log('📊 SIMULATION SUMMARY:');
    console.log('========================');
    console.log(`✅ Total uploads processed: 3`);
    console.log(`📈 Total metrics added: ${result1.exact_matches + result2.exact_matches + result3.exact_matches}`);
    console.log(`⏳ Pending suggestions: ${result1.pending_suggestions + result2.pending_suggestions + result3.pending_suggestions}`);
    console.log(`🎯 Custom ranges created: 4`);
    console.log('');
    console.log('🎉 Simulation completed successfully!');
    console.log('');
    console.log('📱 You can now:');
    console.log('   1. View the dashboard with populated metrics');
    console.log('   2. Check Profile → Custom Reference Ranges');
    console.log('   3. Review pending metric suggestions (if any)');
    console.log('   4. See how custom ranges affect metric evaluation');
    
  } catch (error) {
    console.error('❌ Simulation failed:', error);
  } finally {
    await pool.end();
  }
}

// Extended ingestion service for simulation
if (!require('./services/ingestionService').processMetricsForSimulation) {
  const metricSuggestionService = require('./services/metricSuggestionService');
  
  require('./services/ingestionService').processMetricsForSimulation = async function(extractedMetrics, context) {
    // Use the existing metric suggestion service
    return await metricSuggestionService.processMetrics(extractedMetrics, context);
  };
}

// Run simulation if called directly
if (require.main === module) {
  // Set environment variables
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://majestic:simple123@localhost:5432/health_app';
  
  runSimulation().catch(console.error);
}

module.exports = {
  simulateLabReportUpload,
  createSampleCustomRanges,
  runSimulation,
  mockLabReportAnalysis,
  mockLabReportWithSynonyms,
  mockPregnancyLabReport
};
