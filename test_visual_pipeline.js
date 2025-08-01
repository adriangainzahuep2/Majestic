const sharp = require('sharp');
const fs = require('fs');

// Create a test image that clearly looks like an X-ray
async function createTestXRay() {
  const width = 400;
  const height = 500;
  
  // Create SVG content that simulates an X-ray report
  const svgContent = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Dark background like an X-ray -->
      <rect width="100%" height="100%" fill="#1a1a1a"/>
      
      <!-- X-ray film appearance -->
      <rect x="50" y="50" width="300" height="400" fill="#2a2a2a" stroke="#666" stroke-width="2"/>
      
      <!-- Header text -->
      <text x="200" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="white">CHEST X-RAY</text>
      <text x="60" y="70" font-size="10" fill="white">Patient: Test User | Date: 2025-01-01</text>
      
      <!-- Rib cage simulation -->
      <g stroke="white" stroke-width="1.5" fill="none" opacity="0.7">
        <ellipse cx="200" cy="200" rx="80" ry="30"/>
        <ellipse cx="200" cy="220" rx="85" ry="32"/>
        <ellipse cx="200" cy="240" rx="90" ry="34"/>
        <ellipse cx="200" cy="260" rx="95" ry="36"/>
        <ellipse cx="200" cy="280" rx="100" ry="38"/>
      </g>
      
      <!-- Spine -->
      <line x1="200" y1="150" x2="200" y2="350" stroke="white" stroke-width="3" opacity="0.8"/>
      
      <!-- Heart shadow -->
      <ellipse cx="180" cy="240" rx="25" ry="40" fill="white" opacity="0.3"/>
      
      <!-- Lungs (dark areas) -->
      <ellipse cx="140" cy="220" rx="40" ry="70" fill="#0a0a0a" opacity="0.5"/>
      <ellipse cx="260" cy="220" rx="40" ry="70" fill="#0a0a0a" opacity="0.5"/>
      
      <!-- Report text at bottom -->
      <text x="60" y="470" font-size="8" fill="white">FINDINGS: Normal cardiac silhouette, clear lung fields</text>
      <text x="60" y="485" font-size="8" fill="white">Heart size: Normal (CTR: 0.45)</text>
    </svg>
  `;
  
  const testImagePath = './uploads/test_xray_visual.png';
  await sharp(Buffer.from(svgContent))
    .png()
    .toFile(testImagePath);
    
  console.log(`Test X-ray image created: ${testImagePath}`);
  return testImagePath;
}

// Test the visual studies pipeline specifically
async function testVisualPipeline() {
  try {
    console.log('Creating test X-ray image...');
    const imagePath = await createTestXRay();
    
    console.log('Testing visual studies pipeline...');
    
    const ingestionService = require('./services/ingestionService');
    const fileData = fs.readFileSync(imagePath);
    const base64Data = fileData.toString('base64');
    
    const testFile = {
      originalname: 'test_xray_visual.png',
      mimetype: 'image/png',
      size: fileData.length,
      path: imagePath,
      base64Data
    };
    
    console.log('Processing through unified pipeline...');
    const result = await ingestionService.processFile({
      userId: 1, // Demo user ID
      file: testFile,
      testDate: '2025-01-01'
    });
    
    console.log('Visual Pipeline Result:', JSON.stringify(result, null, 2));
    
    // Check imaging_studies table
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    if (result.studyId) {
      const studyResult = await pool.query(`
        SELECT i.*, hs.name as system_name 
        FROM imaging_studies i 
        LEFT JOIN health_systems hs ON i.linked_system_id = hs.id 
        WHERE i.id = $1
      `, [result.studyId]);
      
      console.log('\n--- VISUAL STUDY SAVED TO DATABASE ---');
      const study = studyResult.rows[0];
      console.log(`Study ID: ${study.id}`);
      console.log(`Study Type: ${study.study_type}`);
      console.log(`System: ${study.system_name || 'Unknown'}`);
      console.log(`AI Summary: ${study.ai_summary}`);
      console.log(`Metrics: ${JSON.stringify(study.metrics_json, null, 2)}`);
      console.log(`Status: ${study.status}`);
    }
    
    // Test the imaging studies API endpoint
    console.log('\n--- TESTING API ENDPOINTS ---');
    
    const studies = await pool.query('SELECT * FROM imaging_studies WHERE user_id = 1 ORDER BY created_at DESC LIMIT 5');
    console.log(`Total visual studies in database: ${studies.rows.length}`);
    
    await pool.end();
    console.log('\n✅ Visual studies pipeline test completed successfully!');
    
  } catch (error) {
    console.error('Visual pipeline test failed:', error);
  }
}

if (require.main === module) {
  testVisualPipeline();
}

module.exports = { createTestXRay, testVisualPipeline };