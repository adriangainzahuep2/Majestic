#!/usr/bin/env node

/**
 * Synonym Sync Script
 * Exports synonyms from database to JSON file for frontend use
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function syncSynonyms() {
  console.log('🔄 Syncing synonyms from database to JSON...\n');

  try {
    // Query synonyms with full metric info
    const result = await pool.query(`
      SELECT 
        s.synonym_id,
        s.synonym_name,
        s.metric_id,
        m.metric_name,
        m.system_id,
        m.canonical_unit,
        m.normal_min,
        m.normal_max
      FROM master_metric_synonyms s
      JOIN master_metrics m ON s.metric_id = m.metric_id
      ORDER BY s.metric_id, s.synonym_id
    `);

    const synonyms = result.rows;
    console.log(`📊 Found ${synonyms.length} synonyms`);

    // Ensure output directory exists
    const outputPath = path.join(process.cwd(), 'public', 'data', 'metric-synonyms.json');
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Write JSON file
    await fs.writeFile(
      outputPath,
      JSON.stringify(synonyms, null, 2),
      'utf8'
    );

    console.log(`✅ Synonyms exported to: ${outputPath}`);

    // Generate summary
    const bySystem = {};
    synonyms.forEach(syn => {
      const systemId = syn.system_id || 'unassigned';
      bySystem[systemId] = (bySystem[systemId] || 0) + 1;
    });

    console.log('\n📈 Summary by system:');
    Object.entries(bySystem).forEach(([systemId, count]) => {
      console.log(`   System ${systemId}: ${count} synonyms`);
    });

    process.exit(0);

  } catch (error) {
    console.error('❌ Error syncing synonyms:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

syncSynonyms();
