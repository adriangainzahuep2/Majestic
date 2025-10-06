const { pool } = require('./database/schema.js');

async function fixMasterConversionGroups() {
  const client = await pool.connect();

  try {
    console.log('🔧 Starting master_conversion_groups table migration...');

    // Drop the table if it exists
    await client.query('DROP TABLE IF EXISTS master_conversion_groups CASCADE');
    console.log('✅ Dropped existing master_conversion_groups table');

    // Create the table with correct composite primary key
    await client.query(`
      CREATE TABLE master_conversion_groups (
        conversion_group_id VARCHAR(100) NOT NULL,
        canonical_unit VARCHAR(50),
        alt_unit VARCHAR(50) NOT NULL,
        to_canonical_formula VARCHAR(255),
        from_canonical_formula VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (conversion_group_id, alt_unit)
      );
    `);

    console.log('✅ Created master_conversion_groups with composite primary key');

    // Verify the table structure
    const result = await client.query(`
      SELECT COUNT(kcu.column_name) as pk_cols
      FROM information_schema.key_column_usage AS kcu
      JOIN information_schema.table_constraints AS tc
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_name = 'master_conversion_groups'
      AND kcu.column_name IN ('conversion_group_id', 'alt_unit');
    `);

    if (result.rows[0].pk_cols === '2') {
      console.log('✅ Migration successful: master_conversion_groups now has composite primary key');
    } else {
      console.log('❌ Migration failed: incorrect primary key structure');
    }

  } catch (error) {
    console.error('❌ Error during migration:', error);
  } finally {
    client.release();
    process.exit(0);
  }
}

fixMasterConversionGroups();
