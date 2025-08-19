#!/usr/bin/env node

// Deployment startup script for Replit
// Ensures PORT is set correctly for both development and production

// Set PORT to 8000 if not already set (matches .replit port configuration)
if (!process.env.PORT) {
  process.env.PORT = '8000';
  console.log('[STARTUP] PORT not set, defaulting to 8000 for Replit deployment compatibility');
} else {
  console.log(`[STARTUP] PORT is set to ${process.env.PORT}`);
}

// Set NODE_ENV to production if not set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
  console.log('[STARTUP] NODE_ENV not set, defaulting to production');
}

// Start the main server
console.log('[STARTUP] Starting Majestic Health Dashboard...');
require('./server.js');