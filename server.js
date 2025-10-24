try { require('dotenv').config(); } catch (_) {}
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const api = require('./api');
const { initializeDatabase, fixMetricRanges } = require('./database/schema');
const queueService = require('./services/queue');

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin.includes('replit.dev') || origin.includes('google.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  req.db = pool;
  next();
});

app.use('/api', api);
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
});

async function startServer() {
  try {
    if (process.env.SKIP_DB_INIT !== 'true') {
      await initializeDatabase();
      await fixMetricRanges();
    }
    if (process.env.SKIP_QUEUE_INIT !== 'true') {
      queueService.init();
    }
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
