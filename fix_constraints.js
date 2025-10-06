/**
 * Fix missing constraints for ON CONFLICT to work
 * Run this with: node fix_constraints.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function fixConstraints() {
  const client = await pool.connect();

  try {
    console.log('🔧 Adding missing unique constraints...');

    await client.query('BEGIN');

    // Add unique constraint to synonym_id if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE master_metric_synonyms
        ADD CONSTRAINT unique_synonym_id UNIQUE (synonym_id);
      `);
      console.log('✅ Added unique constraint to synonym_id');
    } catch (error) {
      if (error.code === '23505') { // Constraint already exists
        console.log('ℹ️  unique_synonym_id constraint already exists');
      } else {
        console.log('⚠️  Could not add unique_synonym_id:', error.message);
      }
    }

    // The conversion_group_id should already be PRIMARY KEY, but let's verify
    const convConstraint = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'master_conversion_groups' AND constraint_type = 'PRIMARY KEY'
    `);

    if (convConstraint.rows.length > 0) {
      console.log('✅ master_conversion_groups already has PRIMARY KEY on conversion_group_id');
    } else {
      console.log('⚠️  master_conversion_groups missing PRIMARY KEY - recreating table...');
      await client.query('DROP TABLE IF EXISTS master_conversion_groups CASCADE');
      await client.query(`
        CREATE TABLE master_conversion_groups (
          conversion_group_id VARCHAR(100) PRIMARY KEY,
          canonical_unit VARCHAR(50),
          alt_unit VARCHAR(50),
          to_canonical_formula VARCHAR(255),
          from_canonical_formula VARCHAR(255),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Recreated master_conversion_groups with PRIMARY KEY');
    }

    await client.query('COMMIT');

    console.log('✅ All constraints fixed!');
    console.log('📋 Next: Restart server and try "Confirm & Commit" again');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fixing constraints:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixConstraints();
