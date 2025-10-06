/**
 * Fix duplicate key constraint errors in admin tables
 * Run this with: node fix_duplicate_keys.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function fixDuplicateKeys() {
  const client = await pool.connect();

  try {
    console.log('🔧 Fixing duplicate key constraints...');

    // Start transaction
    await client.query('BEGIN');

    // Clear problematic tables
    console.log('🧹 Clearing conversion groups...');
    await client.query('DELETE FROM master_conversion_groups');

    console.log('🧹 Clearing synonyms...');
    await client.query('DELETE FROM master_metric_synonyms');

    console.log('🧹 Clearing metrics...');
    await client.query('DELETE FROM master_metrics');

    // Commit changes
    await client.query('COMMIT');

    console.log('✅ All duplicate key conflicts resolved!');
    console.log('📋 Next steps:');
    console.log('1. Restart server: node server.js');
    console.log('2. Try "Confirm & Commit" in admin panel');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fixing duplicate keys:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixDuplicateKeys();
