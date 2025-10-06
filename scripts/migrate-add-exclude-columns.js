'use strict';

try { require('dotenv').config(); } catch (_) {}

const { Pool } = require('pg');

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('[MIGRATE] Connecting to DB...');
    const client = await pool.connect();
    try {
      console.log('[MIGRATE] Applying ALTER TABLE metrics ...');
      await client.query(`
        ALTER TABLE metrics
        ADD COLUMN IF NOT EXISTS exclude_from_analysis BOOLEAN DEFAULT false;
      `);
      await client.query(`
        ALTER TABLE metrics
        ADD COLUMN IF NOT EXISTS review_reason TEXT;
      `);
      console.log('[MIGRATE] Columns ensured on metrics');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[MIGRATE] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    try { await new Promise(res => setTimeout(res, 50)); } catch {}
  }
}

run();


