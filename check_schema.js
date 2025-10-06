const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: false
});

async function checkSchema() {
  try {
    console.log('🔍 Checking database schema...\n');
    
    // Check metrics table structure
    const metricsSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'metrics' 
      ORDER BY ordinal_position
    `);
    
    console.log('📊 METRICS TABLE STRUCTURE:');
    console.log('----------------------------');
    metricsSchema.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Check users table
    const usersSchema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n👥 USERS TABLE STRUCTURE:');
    console.log('--------------------------');
    usersSchema.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    });
    
    // Check uploads table
    const uploadsSchema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'uploads' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n📁 UPLOADS TABLE STRUCTURE:');
    console.log('----------------------------');
    uploadsSchema.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    });
    
    // Check custom ranges table
    const rangesSchema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'custom_reference_ranges' 
      ORDER BY ordinal_position
    `);
    
    console.log('\n🎯 CUSTOM_REFERENCE_RANGES TABLE STRUCTURE:');
    console.log('--------------------------------------------');
    rangesSchema.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
