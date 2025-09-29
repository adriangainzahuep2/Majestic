const { pool } = require('./database/schema.js');

async function debugConversionGroups() {
  const client = await pool.connect();

  try {
    console.log('🔍 Debugging master_conversion_groups table...');

    // Get all current conversion groups
    const result = await client.query('SELECT * FROM master_conversion_groups ORDER BY conversion_group_id, alt_unit');
    console.log(`📊 Current conversion_groups count: ${result.rows.length}`);

    if (result.rows.length > 0) {
      console.log('\nSample current data:');
      result.rows.slice(0, 10).forEach(row => {
        console.log(`  - ${row.conversion_group_id}: ${row.canonical_unit} -> ${row.alt_unit}`);
      });

      if (result.rows.length > 10) {
        console.log(`  ... and ${result.rows.length - 10} more rows`);
      }
    }

    // Analyze the conversion groups by group_id
    const groups = {};
    result.rows.forEach(row => {
      if (!groups[row.conversion_group_id]) {
        groups[row.conversion_group_id] = [];
      }
      groups[row.conversion_group_id].push(row.alt_unit);
    });

    console.log('\n📋 Groups breakdown:');
    Object.entries(groups).forEach(([groupId, units]) => {
      console.log(`  ${groupId}: ${units.length} units - [${units.join(', ')}]`);
    });

  } catch (error) {
    console.error('❌ Error debugging table:', error);
  } finally {
    client.release();
  }
}

debugConversionGroups();
