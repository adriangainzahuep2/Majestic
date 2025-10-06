const { pool } = require('./database/schema.js');

async function cleanMasterTables() {
  const client = await pool.connect();

  try {
    console.log('🧹 Cleaning master tables to reset commit history...');

    // Delete in correct order to respect foreign keys
    await client.query('DELETE FROM master_snapshots');
    await client.query('DELETE FROM master_versions');

    console.log('✅ Master tables cleaned');

    // Verify
    const versionsResult = await client.query('SELECT COUNT(*) as count FROM master_versions');
    const snapshotsResult = await client.query('SELECT COUNT(*) as count FROM master_snapshots');

    console.log(`📊 master_versions count: ${versionsResult.rows[0].count}`);
    console.log(`📊 master_snapshots count: ${snapshotsResult.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error cleaning master tables:', error);
  } finally {
    client.release();
  }
}

cleanMasterTables();
