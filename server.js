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

// Serve static files
app.use(express.static('public'));

// Make database available to routes
app.use((req, res, next) => {
  req.db = pool;
  next();
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/uploads', authMiddleware, uploadRoutes);
app.use('/api/metrics', authMiddleware, metricsRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Default route serves the frontend
app.get('/', (req, res) => {
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
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
