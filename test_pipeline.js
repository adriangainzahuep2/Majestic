const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create a simple test image that looks like a medical chart
async function createTestImage() {
  const width = 400;
  const height = 300;
  
  // Create SVG content that simulates a medical report
  const svgContent = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      
      <!-- Header -->
      <text x="200" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="black">CHEST X-RAY REPORT</text>
      <text x="200" y="50" text-anchor="middle" font-size="12" fill="black">Date: 2025-01-01</text>
      
      <!-- Patient Info -->
      <text x="20" y="80" font-size="14" font-weight="bold" fill="black">Patient: Test User</text>
      <text x="20" y="100" font-size="12" fill="black">Age: 35 years</text>
      
      <!-- Findings -->
      <text x="20" y="130" font-size="14" font-weight="bold" fill="black">FINDINGS:</text>
      <text x="20" y="150" font-size="12" fill="black">• Clear lung fields bilaterally</text>
      <text x="20" y="170" font-size="12" fill="black">• Normal cardiac silhouette</text>
      <text x="20" y="190" font-size="12" fill="black">• No acute abnormalities</text>
      
      <!-- Measurements -->
      <text x="20" y="220" font-size="14" font-weight="bold" fill="black">MEASUREMENTS:</text>
      <text x="20" y="240" font-size="12" fill="black">• Heart Rate: 72 bpm</text>
      <text x="20" y="260" font-size="12" fill="black">• Cardiac Index: 0.45</text>
      
      <!-- Simple lung illustration -->
      <ellipse cx="150" cy="180" rx="40" ry="60" fill="none" stroke="gray" stroke-width="2"/>
      <ellipse cx="250" cy="180" rx="40" ry="60" fill="none" stroke="gray" stroke-width="2"/>
    </svg>
  `;
  
  // Convert SVG to PNG
  const testImagePath = './uploads/test_medical_report.png';
  await sharp(Buffer.from(svgContent))
    .png()
    .toFile(testImagePath);
    
  console.log(`Test image created: ${testImagePath}`);
  return testImagePath;
}

// Test the unified ingestion pipeline
async function testPipeline() {
  try {
    console.log('Creating test medical image...');
    const imagePath = await createTestImage();
    
    console.log('Testing file classification and processing...');
    
    // Test the ingestion service directly
    const ingestionService = require('./services/ingestionService');
    
    // Read the test file
    const fileData = fs.readFileSync(imagePath);
    const base64Data = fileData.toString('base64');
    
    const testFile = {
      originalname: 'test_medical_report.png',
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
    
    console.log('Pipeline Result:', JSON.stringify(result, null, 2));
    
    // Check database for results
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    if (result.dataType === 'visual' && result.studyId) {
      const studyResult = await pool.query('SELECT * FROM imaging_studies WHERE id = $1', [result.studyId]);
      console.log('Study saved to database:', studyResult.rows[0]);
    }
    
    await pool.end();
    
  } catch (error) {
    console.error('Pipeline test failed:', error);
  }
}

if (require.main === module) {
  testPipeline();
}

module.exports = { createTestImage, testPipeline };