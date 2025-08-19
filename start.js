#!/usr/bin/env node

// Deployment startup script for Replit
// Ensures proper environment configuration for deployment

// Force PORT to 8000 for deployment (matches .replit port configuration)
process.env.PORT = '8000';
console.log('[DEPLOYMENT] PORT set to 8000 for Replit deployment');

// Set NODE_ENV to production for deployment
process.env.NODE_ENV = 'production';
console.log('[DEPLOYMENT] NODE_ENV set to production');

// Set other production environment variables
process.env.SKIP_GLOBAL_JOBS = 'true';
console.log('[DEPLOYMENT] SKIP_GLOBAL_JOBS enabled for deployment');

// Start the main server
console.log('[DEPLOYMENT] Starting Majestic Health Dashboard for production...');
require('./server.js');