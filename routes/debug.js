const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, email, name, google_id, created_at, updated_at
      FROM users 
      ORDER BY created_at DESC
    `);
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Debug users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all uploads
router.get('/uploads', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.user_id, u.filename, u.file_type, u.processing_status, u.created_at,
             users.email as user_email
      FROM uploads u
      LEFT JOIN users ON u.user_id = users.id
      ORDER BY u.created_at DESC
    `);
    
    res.json({ uploads: result.rows });
  } catch (error) {
    console.error('Debug uploads error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all metrics
router.get('/metrics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, u.email as user_email
      FROM metrics m
      LEFT JOIN users u ON m.user_id = u.id
      ORDER BY m.test_date DESC, m.metric_name
    `);
    
    res.json({ metrics: result.rows });
  } catch (error) {
    console.error('Debug metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all custom ranges
router.get('/ranges', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.email as user_email
      FROM custom_reference_ranges r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `);
    
    res.json({ ranges: result.rows });
  } catch (error) {
    console.error('Debug ranges error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all pending suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.email as user_email
      FROM pending_metric_suggestions s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
    `);
    
    res.json({ suggestions: result.rows });
  } catch (error) {
    console.error('Debug suggestions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get database schema info
router.get('/schema', async (req, res) => {
  try {
    const tables = ['users', 'uploads', 'metrics', 'custom_reference_ranges', 'pending_metric_suggestions'];
    const schema = {};
    
    for (const table of tables) {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
      `, [table]);
      
      schema[table] = result.rows;
    }
    
    res.json({ schema });
  } catch (error) {
    console.error('Debug schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Database summary
router.get('/summary', async (req, res) => {
  try {
    const summary = {};
    
    // Count records in each table
    const tables = ['users', 'uploads', 'metrics', 'custom_reference_ranges', 'pending_metric_suggestions'];
    
    for (const table of tables) {
      const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      summary[table] = parseInt(result.rows[0].count);
    }
    
    // Additional metrics summary
    const metricsStatusResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM metrics
      GROUP BY status
    `);
    
    summary.metrics_by_status = metricsStatusResult.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {});
    
    res.json({ summary });
  } catch (error) {
    console.error('Debug summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
