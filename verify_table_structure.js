const { pool } = require('./database/schema.js');

async function verifyTableStructure() {
  const client = await pool.connect();

  try {
    console.log('🔍 Verifying master_conversion_groups table structure...');

    // Check primary key structure
    const pkResult = await client.query(`
      SELECT kcu.column_name, kcu.ordinal_position
      FROM information_schema.key_column_usage AS kcu
      JOIN information_schema.table_constraints AS tc
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_name = 'master_conversion_groups'
      ORDER BY kcu.ordinal_position;
    `);

    console.log('Primary key columns:');
    pkResult.rows.forEach(row => {
      console.log(`  - ${row.column_name} (position ${row.ordinal_position})`);
    });

    if (pkResult.rows.length === 2 &&
        pkResult.rows[0].column_name === 'conversion_group_id' &&
        pkResult.rows[1].column_name === 'alt_unit') {
      console.log('✅ Primary key structure is CORRECT');
    } else {
      console.log('❌ Primary key structure is INCORRECT');
      console.log('Expected: conversion_group_id, alt_unit');
    }

    // Check if table has data
    const countResult = await client.query('SELECT COUNT(*) as count FROM master_conversion_groups');
    console.log(`📊 Table contains ${countResult.rows[0].count} rows`);

    // Show sample data
    if (countResult.rows[0].count > 0) {
      const sampleResult = await client.query('SELECT * FROM master_conversion_groups LIMIT 5');
      console.log('Sample data:');
      sampleResult.rows.forEach(row => {
        console.log(`  - ${row.conversion_group_id}: ${row.canonical_unit} -> ${row.alt_unit}`);
      });
    }

  } catch (error) {
    console.error('❌ Error verifying table:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

verifyTableStructure();
