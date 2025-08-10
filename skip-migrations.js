// Temporary script to run server without schema initialization
// This bypasses database migrations during deployment

const express = require('express');
const cors = require('cors');

// Import routes without triggering database schema init
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/uploads');
const metricsRoutes = require('./routes/metrics');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

// Database connection without schema initialization
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
const authMiddleware = require('./middleware/auth');
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  req.db = pool;
  next();
});

// Routes (same as server.js but without schema init)
app.use('/api/auth', authRoutes);
app.use('/api/uploads', authMiddleware, uploadRoutes);
app.use('/api/metrics/custom', authMiddleware, require('./routes/customMetrics'));
app.use('/api/metrics', authMiddleware, metricsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/ingestFile', authMiddleware, require('./routes/ingestFile'));
app.use('/api/imaging-studies', authMiddleware, require('./routes/imagingStudies'));

// Debug endpoints
app.get('/api/__diag/ai_outputs_log_columns', async (req, res) => {
  try {
    const diagToken = req.headers['x-diag-token'];
    if (!diagToken || diagToken !== process.env.DIAG_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const identityResult = await pool.query(`
      SELECT 
        current_database() as database,
        current_user as user,
        current_setting('search_path') as search_path
    `);

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

// Production debug endpoint from server.js
app.post('/api/__debug/upload-test', async (req, res) => {
  try {
    const diagToken = req.headers['x-diag-token'];
    if (!diagToken || diagToken !== process.env.DIAG_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const openAIService = require('./services/openai');
    const healthSystemsService = require('./services/healthSystems');
    
    let diagnosticLogs = [];
    let stepResults = {};

    diagnosticLogs.push('=== PRODUCTION DEPLOYMENT TEST (NO SCHEMA CHANGES) ===');
    
    // Environment check
    stepResults.environment = {
      hasOpenAiKey: !!process.env.OPENAI_API_KEY,
      nodeEnv: process.env.NODE_ENV
    };
    diagnosticLogs.push(`OpenAI API Key: ${stepResults.environment.hasOpenAiKey ? 'Present' : 'MISSING'}`);

    // Database connection
    try {
      const dbTest = await pool.query('SELECT current_database(), current_user, NOW()');
      stepResults.database = { success: true, connection: dbTest.rows[0] };
      diagnosticLogs.push(`Database: CONNECTED - ${dbTest.rows[0].current_database}`);
    } catch (error) {
      stepResults.database = { success: false, error: error.message };
      diagnosticLogs.push(`Database: FAILED - ${error.message}`);
    }

    // System mapping test
    const testMetrics = ['Total Cholesterol', 'LDL Cholesterol'];
    stepResults.systemMapping = {};
    
    testMetrics.forEach(metricName => {
      try {
        const systemId = healthSystemsService.mapMetricToSystem(metricName);
        stepResults.systemMapping[metricName] = systemId;
        diagnosticLogs.push(`Metric "${metricName}" → System ID: ${systemId}`);
      } catch (error) {
        stepResults.systemMapping[metricName] = null;
        diagnosticLogs.push(`Metric "${metricName}" → ERROR: ${error.message}`);
      }
    });

    const issues = [];
    if (!stepResults.environment?.hasOpenAiKey) issues.push('Missing OpenAI API Key');
    if (!stepResults.database?.success) issues.push('Database Connection Failed');
    if (Object.values(stepResults.systemMapping).every(id => !id)) issues.push('System Mapping Failed');

    res.status(200).json({
      timestamp: new Date().toISOString(),
      deploymentTest: issues.length === 0 ? 'PASS' : 'FAIL',
      mode: 'NO_SCHEMA_CHANGES',
      issuesFound: issues,
      stepResults,
      diagnosticLogs,
      recommendation: issues.length === 0 
        ? 'Production deployment ready - system mapping fix deployed successfully'
        : `Fix these issues: ${issues.join(', ')}`
    });

  } catch (error) {
    res.status(500).json({ 
      error: 'Production test failed',
      message: error.message
    });
  }
});

// Static files and health check
app.use(express.static('public'));
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 5000;
app.listen(port, '0.0.0.0', () => {
  console.log('🚀 PRODUCTION DEPLOYMENT (Schema-Safe Mode)');
  console.log(`Majestic Health Dashboard server running on port ${port}`);
  console.log('Health check: http://localhost:' + port + '/api/health');
  console.log('⚠️  Database schema initialization SKIPPED to prevent data loss');
});