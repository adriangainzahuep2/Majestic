/**
 * Majestic Health App - Mobile API
 * RESTful API wrapper for mobile app integration
 */

const express = require('express');
const cors = require('cors');
const authMiddleware = require('../middleware/auth');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const metricsRoutes = require('./metrics');
const healthRoutes = require('./health');
const uploadsRoutes = require('./uploads');
const insightsRoutes = require('./insights');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    service: 'majestic-api'
  });
});

// API routes
app.use('/auth', authRoutes);
app.use('/users', authMiddleware, userRoutes);
app.use('/metrics', authMiddleware, metricsRoutes);
app.use('/health', authMiddleware, healthRoutes);
app.use('/uploads', authMiddleware, uploadsRoutes);
app.use('/insights', authMiddleware, insightsRoutes);

// API documentation
app.get('/api', (req, res) => {
  res.json({
    name: 'Majestic Health App API',
    version: '1.0.0',
    endpoints: {
      auth: '/auth/*',
      users: '/users/*',
      metrics: '/metrics/*',
      health: '/health/*',
      uploads: '/uploads/*',
      insights: '/insights/*'
    },
    documentation: 'https://docs.majestic-app.com'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('[API] Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = app;
