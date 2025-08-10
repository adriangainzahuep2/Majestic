const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');

// Import routes
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/uploads');
const metricsRoutes = require('./routes/metrics');
const dashboardRoutes = require('./routes/dashboard');

// Import middleware
const authMiddleware = require('./middleware/auth');

// Import services
const queueService = require('./services/queue');
const { initializeDatabase } = require('./database/schema');

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Make database available to routes
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// 1. API routes first (before any static serving)
app.use('/api/auth', authRoutes);
app.use('/api/uploads', authMiddleware, uploadRoutes);
app.use('/api/metrics/custom', authMiddleware, require('./routes/customMetrics'));
app.use('/api/metrics', authMiddleware, metricsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);

// Phase 1 Unified Ingestion Pipeline Routes
app.use('/api/ingestFile', authMiddleware, require('./routes/ingestFile'));
app.use('/api/imaging-studies', authMiddleware, require('./routes/imagingStudies'));


// TEMPORARY DIAGNOSTIC ROUTE - Remove after schema verification (no auth required)
app.get('/api/__diag/ai_outputs_log_columns', async (req, res) => {
  try {
    // Security check - only allow with correct diagnostic token
    const diagToken = req.headers['x-diag-token'];
    if (!diagToken || diagToken !== process.env.DIAG_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Query database identity using the same pool the app uses at runtime
    const identityResult = await pool.query(`
      SELECT 
        current_database() as database,
        current_user as user,
        current_setting('search_path') as search_path
    `);

    // Query ai_outputs_log columns using the same pool the app uses at runtime
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ai_outputs_log'
      ORDER BY ordinal_position
    `);

    res.status(200).set('Content-Type', 'application/json').json({
      env: 'prod',
      db_identity: identityResult.rows[0],
      columns: columnsResult.rows
    });

  } catch (error) {
    console.error('Diagnostic route error:', error);
    res.status(500).json({ 
      error: 'Diagnostic query failed',
      message: error.message 
    });
  }
});

// PRODUCTION DEBUG ENDPOINT - Upload Pipeline Testing (no auth required)
app.post('/api/__debug/upload-test', async (req, res) => {
  try {
    // Security check - only allow with correct diagnostic token
    const diagToken = req.headers['x-diag-token'];
    if (!diagToken || diagToken !== process.env.DIAG_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const openAIService = require('./services/openai');
    const healthSystemsService = require('./services/healthSystems');
    
    let diagnosticLogs = [];
    let stepResults = {};

    // Step 1: Environment Check
    diagnosticLogs.push('=== Step 1: Environment Verification ===');
    stepResults.environment = {
      hasOpenAiKey: !!process.env.OPENAI_API_KEY,
      keyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
      nodeEnv: process.env.NODE_ENV
    };
    diagnosticLogs.push(`OpenAI API Key: ${stepResults.environment.hasOpenAiKey ? 'Present' : 'MISSING'} (${stepResults.environment.keyLength} chars)`);

    // Step 2: Test Sample Cardiovascular Lab Report Processing
    diagnosticLogs.push('=== Step 2: AI Extraction Test ===');
    const sampleLabReport = `LIPID PANEL
    Date: 2025-02-01
    Patient: Test Patient
    
    RESULTS:
    Total Cholesterol: 245 mg/dL (Reference: <200)
    LDL Cholesterol: 165 mg/dL (Reference: <100)
    HDL Cholesterol: 42 mg/dL (Reference: >40)
    Triglycerides: 189 mg/dL (Reference: <150)
    Non-HDL Cholesterol: 203 mg/dL (Reference: <130)
    Cholesterol/HDL Ratio: 5.8 (Reference: <5.0)`;

    try {
      const aiResponse = await openAIService.processLabReport(
        Buffer.from(sampleLabReport).toString('base64'), 
        'sample_lipid_panel.pdf'
      );
      stepResults.aiExtraction = {
        success: true,
        response: aiResponse,
        extractedMetricsCount: aiResponse && typeof aiResponse === 'string' ? (aiResponse.match(/\w+:/g) || []).length : 0
      };
      diagnosticLogs.push(`AI Extraction: SUCCESS - ${stepResults.aiExtraction.extractedMetricsCount} metrics detected`);
      diagnosticLogs.push(`AI Response Preview: ${aiResponse && typeof aiResponse === 'string' ? aiResponse.substring(0, 200) + '...' : JSON.stringify(aiResponse).substring(0, 200) + '...'}`);
    } catch (error) {
      stepResults.aiExtraction = {
        success: false,
        error: error.message
      };
      diagnosticLogs.push(`AI Extraction: FAILED - ${error.message}`);
    }

    // Step 3: Test System Mapping
    diagnosticLogs.push('=== Step 3: System Mapping Test ===');
    const testMetrics = ['Total Cholesterol', 'LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides'];
    stepResults.systemMapping = {};
    
    testMetrics.forEach(metricName => {
      try {
        const systemId = healthSystemsService.mapMetricToSystem(metricName);
        stepResults.systemMapping[metricName] = systemId;
        diagnosticLogs.push(`Metric "${metricName}" → System ID: ${systemId || 'NULL'}`);
      } catch (error) {
        stepResults.systemMapping[metricName] = null;
        diagnosticLogs.push(`Metric "${metricName}" → MAPPING ERROR: ${error.message}`);
      }
    });

    // Step 4: Database Connection Test
    diagnosticLogs.push('=== Step 4: Database Connection Test ===');
    try {
      const dbTest = await pool.query('SELECT current_database(), current_user, NOW()');
      stepResults.database = {
        success: true,
        connection: dbTest.rows[0]
      };
      diagnosticLogs.push(`Database: CONNECTED - ${dbTest.rows[0].current_database} as ${dbTest.rows[0].current_user}`);
    } catch (error) {
      stepResults.database = {
        success: false,
        error: error.message
      };
      diagnosticLogs.push(`Database: CONNECTION FAILED - ${error.message}`);
    }

    // Step 5: Test Metric Insert (dry run)
    diagnosticLogs.push('=== Step 5: Metric Insert Test (Dry Run) ===');
    try {
      const testMetric = {
        metric_name: 'Test LDL Cholesterol',
        metric_value: 165,
        system_id: stepResults.systemMapping['LDL Cholesterol'],
        test_date: '2025-02-01'
      };
      
      // Don't actually insert, just test the query structure
      stepResults.metricInsert = {
        success: true,
        testMetric: testMetric,
        systemIdAssigned: !!testMetric.system_id
      };
      diagnosticLogs.push(`Metric Insert Test: READY - System ID assigned: ${!!testMetric.system_id}`);
      diagnosticLogs.push(`Test metric would be: ${JSON.stringify(testMetric)}`);
    } catch (error) {
      stepResults.metricInsert = {
        success: false,
        error: error.message
      };
      diagnosticLogs.push(`Metric Insert Test: FAILED - ${error.message}`);
    }

    // Summary
    diagnosticLogs.push('=== DIAGNOSTIC SUMMARY ===');
    const issues = [];
    if (!stepResults.environment?.hasOpenAiKey) issues.push('Missing OpenAI API Key');
    if (!stepResults.aiExtraction?.success) issues.push('AI Extraction Failed');
    if (!stepResults.database?.success) issues.push('Database Connection Failed');
    if (Object.values(stepResults.systemMapping).every(id => !id)) issues.push('System Mapping Failed');
    if (!stepResults.metricInsert?.systemIdAssigned) issues.push('System ID Assignment Failed');

    diagnosticLogs.push(`Issues Found: ${issues.length === 0 ? 'NONE - Pipeline should work' : issues.join(', ')}`);

    res.status(200).json({
      timestamp: new Date().toISOString(),
      pipelineTest: issues.length === 0 ? 'PASS' : 'FAIL',
      issuesFound: issues,
      stepResults,
      diagnosticLogs,
      recommendation: issues.length === 0 
        ? 'Upload pipeline should work correctly'
        : `Fix these issues: ${issues.join(', ')}`
    });

  } catch (error) {
    console.error('Upload test diagnostic error:', error);
    res.status(500).json({ 
      error: 'Diagnostic test failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Public route for reference metrics data (no auth required)
app.get('/api/metrics/reference', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const metricsPath = path.join(__dirname, 'src/data/metrics.json');
    
    if (!fs.existsSync(metricsPath)) {
      return res.status(404).json({
        error: 'Reference metrics data not found',
        message: 'metrics.json file does not exist'
      });
    }
    
    const metricsData = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    
    res.json(metricsData);
    
  } catch (error) {
    console.error('Get reference metrics error:', error);
    res.status(500).json({
      error: 'Failed to load reference metrics',
      message: error.message
    });
  }
});

// Email ingestion webhook (no auth required)
app.post('/api/webhook/email', express.json(), async (req, res) => {
  try {
    const { sender, attachments } = req.body;
    
    // Find user by email
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [sender]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    // Process each attachment
    for (const attachment of attachments) {
      // Queue processing job
      await queueService.addJob('process-upload', {
        userId,
        fileName: attachment.filename,
        fileData: attachment.data,
        uploadType: 'email'
      });
    }
    
    res.json({ success: true, message: 'Files queued for processing' });
  } catch (error) {
    console.error('Email webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Enhanced health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Majestic Health Dashboard'
  });
});

// 2. Explicit root route for health checks (must be before static files)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 3. Static assets (CSS, JS, images)
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 4. SPA fallback for client-side routing (must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Initialize services and start server
async function startServer() {
  try {
    // Initialize database schema
    console.log('Initializing database...');
    await initializeDatabase();
    
    // Initialize queue service (with graceful degradation)
    console.log('Initializing queue service...');
    queueService.init();
    
    // Configuration logging
    if (process.env.SKIP_GLOBAL_JOBS === "true") {
      console.log("[CONFIG] SKIP_GLOBAL_JOBS is ENABLED – Key Findings and Daily Plan will NOT run.");
    } else {
      console.log("[CONFIG] SKIP_GLOBAL_JOBS is DISABLED – Global jobs will run normally.");
    }
    
    // Start the server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Majestic Health Dashboard server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Application: http://localhost:${PORT}/`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
