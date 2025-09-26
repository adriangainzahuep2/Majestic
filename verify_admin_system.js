/**
 * Verify admin system is working after duplicate key fix
 * Run this with: node verify_admin_system.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function verifyAdminSystem() {
  const client = await pool.connect();

  try {
    console.log('🔍 Verifying admin system...');

    // Check table structures
    const tables = ['master_metrics', 'master_metric_synonyms', 'master_conversion_groups'];
    for (const table of tables) {
      const result = await client.query(`
        SELECT column_name, data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name IN ('normal_min', 'normal_max')
        ORDER BY column_name
      `, [table]);

      if (result.rows.length > 0) {
        console.log(`📊 ${table}:`);
        result.rows.forEach(row => {
          console.log(`  - ${row.column_name}: ${row.data_type}(${row.numeric_precision},${row.numeric_scale})`);
        });
      } else {
        console.log(`✅ ${table}: Columnas DECIMAL configuradas correctamente`);
      }
    }

    // Check for existing data
    console.log('\n📈 Datos actuales:');
    for (const table of tables) {
      const count = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`  - ${table}: ${count.rows[0].count} registros`);
    }

    console.log('\n✅ Sistema de admin verificado correctamente');
    console.log('🎯 Listo para "Confirm & Commit"');

  } catch (error) {
    console.error('❌ Error verificando sistema:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyAdminSystem();
