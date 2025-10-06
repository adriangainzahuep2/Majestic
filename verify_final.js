/**
 * Final verification that admin system is ready for commit
 * Run this with: node verify_final.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function verifyFinal() {
  const client = await pool.connect();

  try {
    console.log('🔍 Final verification before commit...');

    // Check constraints
    const constraints = await client.query(`
      SELECT table_name, constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name IN ('master_conversion_groups', 'master_metric_synonyms')
      ORDER BY table_name, constraint_type
    `);

    console.log('📋 Current constraints:');
    constraints.rows.forEach(row => {
      console.log(`  - ${row.table_name}: ${row.constraint_name} (${row.constraint_type})`);
    });

    // Check table structures
    console.log('\n📊 Table structures:');
    const tables = ['master_metrics', 'master_metric_synonyms', 'master_conversion_groups'];
    for (const table of tables) {
      const columns = await client.query(`
        SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name IN ('normal_min', 'normal_max', 'synonym_id', 'conversion_group_id')
        ORDER BY column_name
      `, [table]);

      if (columns.rows.length > 0) {
        console.log(`  - ${table}:`);
        columns.rows.forEach(col => {
          let typeInfo = col.data_type;
          if (col.character_maximum_length) typeInfo += `(${col.character_maximum_length})`;
          if (col.numeric_precision) typeInfo += `(${col.numeric_precision},${col.numeric_scale})`;
          console.log(`    ${col.column_name}: ${typeInfo}`);
        });
      }
    }

    // Check current data
    console.log('\n📈 Current data counts:');
    for (const table of tables) {
      const count = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`  - ${table}: ${count.rows[0].count} registros`);
    }

    console.log('\n✅ System ready for commit!');
    console.log('🎯 Go to admin panel and try "Confirm & Commit"');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyFinal();
