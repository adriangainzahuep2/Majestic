#!/usr/bin/env node

/**
 * Data Integrity Check Script
 * Runs all integrity checks and reports issues
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkIntegrity() {
  console.log('🔍 Running data integrity checks...\n');

  try {
    const result = await pool.query(`
      SELECT * FROM check_metric_data_integrity()
    `);

    if (result.rows.length === 0) {
      console.log('✅ No integrity issues found!');
      process.exit(0);
    }

    console.log(`⚠️  Found ${result.rows.length} integrity issue(s):\n`);

    const issuesByType = {};
    result.rows.forEach(issue => {
      if (!issuesByType[issue.issue_type]) {
        issuesByType[issue.issue_type] = [];
      }
      issuesByType[issue.issue_type].push(issue);
    });

    Object.entries(issuesByType).forEach(([type, issues]) => {
      console.log(`\n📌 ${type} (${issues.length}):`);
      issues.forEach(issue => {
        console.log(`   - ${issue.metric_name} (${issue.metric_id}): ${issue.issue_description}`);
      });
    });

    console.log('\n');
    process.exit(1);

  } catch (error) {
    console.error('❌ Error running integrity check:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkIntegrity();
