try { require('dotenv').config(); } catch (_) {}
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
const profileRoutes = require('./routes/profile');

// Import middleware
const authMiddleware = require('./middleware/auth');

// Import services
const queueService = require('./services/queue');
const { initializeDatabase } = require('./database/schema');

const app = express();
const PORT = process.env.PORT || 5000 || 3000 || 32775;
// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'health-app.c4vuie06a0wt.us-east-1.rds.amazonaws.com:5432',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow localhost for development (all ports)
    if (origin.includes('*')) return callback(null, true);

    // Allow Replit domains (both short and long)
    if (origin.includes('replit.dev')) return callback(null, true);

    // Allow your production domain if you have one
    if (origin.includes('majesticapp.replit.dev')) return callback(null, true);

    // Allow Google OAuth domains for FedCM
    if (origin.includes('google.com') ||
        origin.includes('accounts.google.com') ||
        origin.includes('googlesyndication.com') ||
        origin.includes('gstatic.com')) {
      return callback(null, true);
    }

    // Block other origins
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: [
    'Content-Length',
    'X-Requested-With',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials'
  ]
};

// Custom middleware for FedCM requirements and logging
app.use((req, res, next) => {
  const origin = req.get('Origin') || req.headers.origin;
  console.log(`[Request Logger] Path: ${req.path}, Method: ${req.method}, Origin: ${origin}`);

  // Set COOP/COEP headers for all responses, as required by FedCM for cross-origin isolation.
  // These headers are essential for creating a secure context for the credential manager.
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Make database available to routes
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// 1. API routes first (before any static serving)
app.use('/api/auth', authRoutes);

// Public route for reference metrics data (no auth required)
app.get('/api/metrics/reference', (req, res) => {
  try {
    const catalog = require('./shared/metricsCatalog');
    const all = catalog.getAllMetrics();
    res.json(all);
  } catch (error) {
    console.error('Get reference metrics error:', error);
    res.status(500).json({
      error: 'Failed to load reference metrics',
      message: error.message
    });
  }
});

app.use('/api/uploads', authMiddleware, uploadRoutes);
app.use('/api/metrics/custom', authMiddleware, require('./routes/customMetrics'));
app.use('/api/metrics', authMiddleware, metricsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/profile', authMiddleware, profileRoutes);

// Phase 1 Unified Ingestion Pipeline Routes
app.use('/api/ingestFile', authMiddleware, require('./routes/ingestFile'));
app.use('/api/imaging-studies', authMiddleware, require('./routes/imagingStudies'));
app.use('/api/metric-suggestions', authMiddleware, require('./routes/metricSuggestions'));
app.use('/api/custom-reference-ranges', authMiddleware, require('./routes/customReferenceRanges'));

// Admin routes (protected by admin allowlist)
// TEMPORARILY DISABLED AUTH FOR ADMIN ROUTES (local testing only)
// const adminAuth = require('./middleware/auth');
// app.use('/api/admin', adminAuth, adminAuth.adminOnly, require('./routes/admin'));
app.use('/api/admin', require('./routes/admin'));

// Debug routes (no auth for debugging)
app.use('/api/debug', require('./routes/debug'));

// 2. Explicit root route for health checks (must be before static files)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Simple health check for Cloud Run (faster response) - MUST be before static files
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Enhanced health check endpoint for deployment
app.get('/api/health', async (req, res) => {
  try {
    // Basic service health
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'Majestic Health Dashboard',
      port: process.env.PORT,
      environment: process.env.NODE_ENV || 'development'
    };

    // Test database connection for deployment readiness
    if (process.env.NODE_ENV === 'production') {
      try {
        await (req.db || pool).query('SELECT 1');
        health.database = 'connected';
      } catch (dbError) {
        health.database = 'error';
        health.status = 'DEGRADED';
      }
    }

    res.status(200).json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// 3. Static assets (CSS, JS, images) - AFTER API routes
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 4. SPA fallback for client-side routing (must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database viewer HTML page
app.get('/database-viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'database_viewer.html'));
});


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

// Alternate public route (auth-free) to avoid router collision
app.get('/api/reference/metrics', (req, res) => {
  try {
    const catalog = require('./shared/metricsCatalog');
    const all = catalog.getAllMetrics();
    res.json(all);
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

// Enhanced health check endpoint for deployment
app.get('/api/health', async (req, res) => {
  try {
    // Basic service health
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'Majestic Health Dashboard',
      port: PORT,
      environment: process.env.NODE_ENV || 'development'
    };

    // Test database connection for deployment readiness
    if (process.env.NODE_ENV === 'production') {
      try {
        await pool.query('SELECT 1');
        health.database = 'connected';
      } catch (dbError) {
        health.database = 'error';
        health.status = 'DEGRADED';
      }
    }

    res.status(200).json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Database viewer HTML page
app.get('/database-viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'database_viewer.html'));
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
    // Initialize database schema (skippable for local smoke tests)
    console.log('Initializing database...');
    if (process.env.SKIP_DB_INIT === 'true') {
      console.log('SKIP_DB_INIT is true – skipping database initialization');
    } else {
      await initializeDatabase();
    }
    
    // Initialize queue service (with graceful degradation)
    console.log('Initializing queue service...');
    if (process.env.SKIP_QUEUE_INIT === 'true') {
      console.log('SKIP_QUEUE_INIT is true – skipping queue initialization');
    } else {
      queueService.init();
    }
    
    // Configuration logging
    if (process.env.SKIP_GLOBAL_JOBS === "true") {
      console.log("[CONFIG] SKIP_GLOBAL_JOBS is ENABLED – Key Findings and Daily Plan will NOT run.");
    } else {
      console.log("[CONFIG] SKIP_GLOBAL_JOBS is DISABLED – Global jobs will run normally.");
    }
    
    // Start the server
    const server = app.listen(PORT, '*', () => {
      console.log(`✅ Majestic Health Dashboard server running on port ${PORT}`);
      console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
      console.log(`✅ Application: http://localhost:${PORT}/`);
      console.log(`✅ Environment: ${process.env.NODE_ENV || 'production'}`);
      console.log(`✅ Server ready for connections`);
    });

    // Handle server errors gracefully
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

const router = app.Router();

// Import middleware
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimit');

// Import controllers
const authController = require('../controllers/authController');
const metricsController = require('../controllers/metricsController');
const uploadsController = require('../controllers/uploadsController');
const dashboardController = require('../controllers/dashboardController');
const profileController = require('../controllers/profileController');
const imagingController = require('../controllers/imagingController');

// ============================================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================================

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/health/ready', async (req, res) => {
  try {
    await req.db.query('SELECT 1');
    res.json({ status: 'ready', db: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', db: 'disconnected' });
  }
});

// Reference data (public)
router.get('/reference/metrics', metricsController.getReferenceMetrics);
router.get('/reference/systems', metricsController.getHealthSystems);

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

const authRouter = express.Router();

authRouter.post('/login', 
  rateLimiter({ maxRequests: 5, windowMs: 15 * 60 * 1000 }),
  validateRequest('login'),
  authController.login
);

authRouter.post('/register', 
  rateLimiter({ maxRequests: 3, windowMs: 60 * 60 * 1000 }),
  validateRequest('register'),
  authController.register
);

authRouter.post('/logout', 
  authMiddleware, 
  authController.logout
);

authRouter.post('/refresh', 
  validateRequest('refreshToken'),
  authController.refreshToken
);

authRouter.get('/google', authController.googleAuth);
authRouter.get('/google/callback', authController.googleAuthCallback);

authRouter.get('/profile', 
  authMiddleware, 
  authController.getProfile
);

authRouter.put('/profile', 
  authMiddleware,
  validateRequest('updateProfile'),
  authController.updateProfile
);

router.use('/auth', authRouter);

// ============================================================================
// METRICS ROUTES (Authenticated)
// ============================================================================

const metricsRouter = express.Router();
metricsRouter.use(authMiddleware);

// Get all metrics for current user
metricsRouter.get('/', 
  validateRequest('getMetrics'),
  metricsController.getMetrics
);

// Get specific metric details
metricsRouter.get('/:id', 
  metricsController.getMetricById
);

// Add new metric manually
metricsRouter.post('/', 
  validateRequest('createMetric'),
  metricsController.createMetric
);

// Update metric
metricsRouter.put('/:id', 
  validateRequest('updateMetric'),
  metricsController.updateMetric
);

// Delete metric
metricsRouter.delete('/:id', 
  metricsController.deleteMetric
);

// Get metric trends
metricsRouter.get('/:metricName/trend', 
  validateRequest('getMetricTrend'),
  metricsController.getMetricTrend
);

// Get metrics by system
metricsRouter.get('/system/:systemId', 
  metricsController.getMetricsBySystem
);

// Get outlier metrics
metricsRouter.get('/outliers/list', 
  metricsController.getOutliers
);

// Search metrics
metricsRouter.get('/search/:query', 
  metricsController.searchMetrics
);

router.use('/metrics', metricsRouter);

// ============================================================================
// UPLOADS ROUTES (Authenticated)
// ============================================================================

const uploadsRouter = express.Router();
uploadsRouter.use(authMiddleware);

// Upload lab results
uploadsRouter.post('/', 
  rateLimiter({ maxRequests: 10, windowMs: 60 * 60 * 1000 }),
  uploadsController.uploadFile
);

// Get upload history
uploadsRouter.get('/', 
  uploadsController.getUploadHistory
);

// Get upload status
uploadsRouter.get('/:uploadId/status', 
  uploadsController.getUploadStatus
);

// Reprocess failed upload
uploadsRouter.post('/:uploadId/reprocess', 
  uploadsController.reprocessUpload
);

// Delete upload and associated metrics
uploadsRouter.delete('/:uploadId', 
  uploadsController.deleteUpload
);

router.use('/uploads', uploadsRouter);

// ============================================================================
// DASHBOARD ROUTES (Authenticated)
// ============================================================================

const dashboardRouter = express.Router();
dashboardRouter.use(authMiddleware);

// Get dashboard summary
dashboardRouter.get('/summary', 
  dashboardController.getSummary
);

// Get key findings
dashboardRouter.get('/key-findings', 
  dashboardController.getKeyFindings
);

// Get system scores
dashboardRouter.get('/system-scores', 
  dashboardController.getSystemScores
);

// Get daily plan
dashboardRouter.get('/daily-plan', 
  dashboardController.getDailyPlan
);

// Get recommendations
dashboardRouter.get('/recommendations', 
  dashboardController.getRecommendations
);

// Get health insights
dashboardRouter.get('/insights', 
  dashboardController.getInsights
);

router.use('/dashboard', dashboardRouter);

// ============================================================================
// PROFILE ROUTES (Authenticated)
// ============================================================================

const profileRouter = express.Router();
profileRouter.use(authMiddleware);

// Get complete profile
profileRouter.get('/', 
  profileController.getProfile
);

// Update profile
profileRouter.put('/', 
  validateRequest('updateProfile'),
  profileController.updateProfile
);

// Update health profile
profileRouter.put('/health', 
  validateRequest('updateHealthProfile'),
  profileController.updateHealthProfile
);

// Add chronic condition
profileRouter.post('/conditions', 
  validateRequest('addCondition'),
  profileController.addChronicCondition
);

// Remove chronic condition
profileRouter.delete('/conditions/:conditionId', 
  profileController.removeChronicCondition
);

// Add allergy
profileRouter.post('/allergies', 
  validateRequest('addAllergy'),
  profileController.addAllergy
);

// Remove allergy
profileRouter.delete('/allergies/:allergyId', 
  profileController.removeAllergy
);

router.use('/profile', profileRouter);

// ============================================================================
// IMAGING STUDIES ROUTES (Authenticated)
// ============================================================================

const imagingRouter = express.Router();
imagingRouter.use(authMiddleware);

// Upload imaging study
imagingRouter.post('/', 
  rateLimiter({ maxRequests: 5, windowMs: 60 * 60 * 1000 }),
  imagingController.uploadStudy
);

// Get all imaging studies
imagingRouter.get('/', 
  imagingController.getStudies
);

// Get specific study
imagingRouter.get('/:studyId', 
  imagingController.getStudyById
);

// Update study metadata
imagingRouter.put('/:studyId', 
  validateRequest('updateStudy'),
  imagingController.updateStudy
);

// Delete study
imagingRouter.delete('/:studyId', 
  imagingController.deleteStudy
);

// Get study comparison
imagingRouter.get('/:studyId/compare/:compareStudyId', 
  imagingController.compareStudies
);

router.use('/imaging', imagingRouter);

// ============================================================================
// METRIC SUGGESTIONS ROUTES (Authenticated)
// ============================================================================

const suggestionsRouter = express.Router();
suggestionsRouter.use(authMiddleware);

// Get pending suggestions
suggestionsRouter.get('/pending', 
  metricsController.getPendingSuggestions
);

// Approve suggestions
suggestionsRouter.post('/approve', 
  validateRequest('approveSuggestions'),
  metricsController.approveSuggestions
);

// Reject suggestions
suggestionsRouter.post('/reject', 
  validateRequest('rejectSuggestions'),
  metricsController.rejectSuggestions
);

router.use('/suggestions', suggestionsRouter);

// ============================================================================
// CUSTOM REFERENCE RANGES ROUTES (Authenticated)
// ============================================================================

const rangesRouter = express.Router();
rangesRouter.use(authMiddleware);

// Get custom ranges
rangesRouter.get('/', 
  metricsController.getCustomRanges
);

// Add custom range
rangesRouter.post('/', 
  validateRequest('addCustomRange'),
  metricsController.addCustomRange
);

// Update custom range
rangesRouter.put('/:rangeId', 
  validateRequest('updateCustomRange'),
  metricsController.updateCustomRange
);

// Delete custom range
rangesRouter.delete('/:rangeId', 
  metricsController.deleteCustomRange
);

router.use('/ranges', rangesRouter);

// ============================================================================
// ADMIN ROUTES (Admin only)
// ============================================================================

const adminRouter = express.Router();
adminRouter.use(authMiddleware);
adminRouter.use(adminMiddleware);

// Upload master spreadsheet
adminRouter.post('/spreadsheet', 
  rateLimiter({ maxRequests: 5, windowMs: 60 * 60 * 1000 }),
  require('../controllers/adminController').uploadSpreadsheet
);

// Get spreadsheet versions
adminRouter.get('/spreadsheet/versions', 
  require('../controllers/adminController').getSpreadsheetVersions
);

// Rollback to previous version
adminRouter.post('/spreadsheet/rollback/:versionId', 
  require('../controllers/adminController').rollbackSpreadsheet
);

// Get data integrity report
adminRouter.get('/integrity-check', 
  require('../controllers/adminController').checkDataIntegrity
);

// Regenerate synonyms JSON
adminRouter.post('/sync-synonyms', 
  require('../controllers/adminController').syncSynonyms
);

// Get system stats
adminRouter.get('/stats', 
  require('../controllers/adminController').getSystemStats
);

// Get user list
adminRouter.get('/users', 
  require('../controllers/adminController').getUsers
);

router.use('/admin', adminRouter);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
router.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
router.use((err, req, res, next) => {
  console.error('API Error:', err);

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details
    });
  }

  // Authentication errors
  if (err.name === 'UnauthorizedError' || err.status === 401) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // Rate limit errors
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

startServer();

module.exports = app;
