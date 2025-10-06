const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://majestic:simple123@localhost:5432/health_app',
  ssl: false
});

async function fixDatabaseStructure() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing database structure...\n');
    
    // Check current metrics table structure
    console.log('📊 Checking current metrics table structure...');
    const metricsColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'metrics' 
      ORDER BY ordinal_position
    `);
    
    console.log('Current columns in metrics table:');
    metricsColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    
    // Add missing columns to metrics table
    const columnsToAdd = [
      { name: 'system_id', type: 'INTEGER', default: '8' },
      { name: 'status', type: 'VARCHAR(20)', default: "'Normal'" },
      { name: 'reference_range_min', type: 'DECIMAL' },
      { name: 'reference_range_max', type: 'DECIMAL' },
      { name: 'source_type', type: 'VARCHAR(50)', default: "'upload'" }
    ];
    
    console.log('\n🔧 Adding missing columns to metrics table...');
    
    for (const column of columnsToAdd) {
      try {
        // Check if column exists
        const columnExists = metricsColumns.rows.some(col => col.column_name === column.name);
        
        if (!columnExists) {
          let alterQuery = `ALTER TABLE metrics ADD COLUMN ${column.name} ${column.type}`;
          if (column.default) {
            alterQuery += ` DEFAULT ${column.default}`;
          }
          
          await client.query(alterQuery);
          console.log(`  ✅ Added column: ${column.name}`);
        } else {
          console.log(`  ⚠️  Column already exists: ${column.name}`);
        }
      } catch (error) {
        console.log(`  ❌ Failed to add column ${column.name}:`, error.message);
      }
    }
    
    // Fix column name if needed (units vs metric_unit)
    try {
      const hasUnits = metricsColumns.rows.some(col => col.column_name === 'units');
      const hasMetricUnit = metricsColumns.rows.some(col => col.column_name === 'metric_unit');
      
      if (!hasUnits && hasMetricUnit) {
        await client.query('ALTER TABLE metrics RENAME COLUMN metric_unit TO units');
        console.log('  ✅ Renamed metric_unit to units');
      }
    } catch (error) {
      console.log('  ⚠️  Column rename not needed or failed:', error.message);
    }
    
    // Update existing metrics with default values
    console.log('\n📊 Updating existing metrics with default values...');
    
    try {
      // Set default system_id for existing metrics
      await client.query(`
        UPDATE metrics 
        SET system_id = 8 
        WHERE system_id IS NULL
      `);
      
      // Set default status for existing metrics
      await client.query(`
        UPDATE metrics 
        SET status = 'Normal' 
        WHERE status IS NULL
      `);
      
      // Set default source_type for existing metrics
      await client.query(`
        UPDATE metrics 
        SET source_type = 'upload' 
        WHERE source_type IS NULL
      `);
      
      console.log('  ✅ Updated existing metrics with default values');
    } catch (error) {
      console.log('  ❌ Failed to update existing metrics:', error.message);
    }
    
    // Insert fresh test data
    console.log('\n📈 Inserting fresh test data...');
    
    // Get or create demo user
    const userResult = await client.query(`
      INSERT INTO users (email, name, google_id) 
      VALUES ('demo@majestic.com', 'Demo User', 'demo-123')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    
    const userId = userResult.rows[0].id;
    console.log(`👤 Demo user ID: ${userId}`);
    
    // Clear existing demo user data
    await client.query('DELETE FROM metrics WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM uploads WHERE user_id = $1', [userId]);
    
    // Create upload
    const uploadResult = await client.query(`
      INSERT INTO uploads (user_id, filename, file_type, processing_status, created_at)
      VALUES ($1, 'comprehensive_labs_2024-01-15.pdf', 'lab_report', 'completed', '2024-01-15')
      RETURNING id
    `, [userId]);
    
    const uploadId = uploadResult.rows[0].id;
    console.log(`📁 Upload ID: ${uploadId}`);
    
    // Insert metrics with correct column names
    const testMetrics = [
      ['HDL Cholesterol', 58, 'mg/dL', 1, 'Normal', 40, 60],
      ['LDL Cholesterol', 135, 'mg/dL', 1, 'High', 0, 100],
      ['Total Cholesterol', 210, 'mg/dL', 1, 'High', 0, 200],
      ['Triglycerides', 165, 'mg/dL', 1, 'High', 0, 150],
      ['Hemoglobin A1c (HbA1c)', 5.8, '%', 2, 'High', 4.0, 5.6],
      ['Fasting Glucose', 108, 'mg/dL', 2, 'High', 70, 100],
      ['Serum Creatinine', 0.9, 'mg/dL', 3, 'Normal', 0.6, 1.2],
      ['Thyroid Stimulating Hormone (TSH)', 2.1, 'μIU/mL', 2, 'Normal', 0.4, 4.0],
      ['Hemoglobin', 13.8, 'g/dL', 5, 'Normal', 12.0, 15.5],
      ['White Blood Cell Count (WBC)', 6.2, '10³/μL', 5, 'Normal', 4.0, 10.0]
    ];
    
    let insertedCount = 0;
    for (const [name, value, unit, systemId, status, min, max] of testMetrics) {
      try {
        await client.query(`
          INSERT INTO metrics (
            user_id, upload_id, metric_name, metric_value, units,
            test_date, system_id, status, reference_range_min, reference_range_max, source_type
          ) VALUES ($1, $2, $3, $4, $5, '2024-01-15', $6, $7, $8, $9, 'upload')
        `, [userId, uploadId, name, value, unit, systemId, status, min, max]);
        
        insertedCount++;
        console.log(`  ✅ ${name}: ${value} ${unit} [${status}]`);
      } catch (error) {
        console.log(`  ❌ Failed to insert ${name}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Successfully fixed database structure and inserted ${insertedCount} metrics!`);
    console.log('\n📱 You can now:');
    console.log('   1. Refresh your browser and try Demo Login');
    console.log('   2. View the database at: http://localhost:5000/database-viewer');
    console.log('   3. Check the schema at: http://localhost:5000/api/debug/schema');
    
  } catch (error) {
    console.error('❌ Error fixing database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the fix
fixDatabaseStructure();
