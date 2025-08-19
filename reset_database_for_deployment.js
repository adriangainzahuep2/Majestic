#!/usr/bin/env node

/**
 * Database Reset Script for Deployment Issues
 * 
 * This script safely resets the database schema to resolve migration conflicts
 * that can occur during Replit deployments. It preserves user data while
 * ensuring schema consistency.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function resetDatabaseForDeployment() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database reset for deployment...');
    
    // First, backup critical data
    console.log('📦 Backing up user data...');
    const usersBackup = await client.query('SELECT * FROM users');
    const metricsBackup = await client.query('SELECT * FROM metrics WHERE user_id IS NOT NULL');
    const uploadsBackup = await client.query('SELECT * FROM uploads WHERE user_id IS NOT NULL');
    
    console.log(`✅ Backed up: ${usersBackup.rows.length} users, ${metricsBackup.rows.length} metrics, ${uploadsBackup.rows.length} uploads`);
    
    // Drop all tables in correct order (respecting foreign keys)
    console.log('🗑️ Dropping existing tables...');
    await client.query('DROP TABLE IF EXISTS questionnaire_responses CASCADE');
    await client.query('DROP TABLE IF EXISTS imaging_studies CASCADE');
    await client.query('DROP TABLE IF EXISTS user_custom_metrics CASCADE');
    await client.query('DROP TABLE IF EXISTS ai_outputs_log CASCADE');
    await client.query('DROP TABLE IF EXISTS metrics CASCADE');
    await client.query('DROP TABLE IF EXISTS uploads CASCADE');
    await client.query('DROP TABLE IF EXISTS health_systems CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');
    
    console.log('🏗️ Recreating clean schema...');
    
    // Recreate users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        google_id VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Recreate health_systems table
    await client.query(`
      CREATE TABLE health_systems (
        id INTEGER PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert health systems data
    const healthSystems = [
      { id: 1, name: 'Cardiovascular', description: 'Heart and blood vessel health' },
      { id: 2, name: 'Nervous/Brain', description: 'Cognitive and neurological function' },
      { id: 3, name: 'Respiratory', description: 'Lung and breathing function' },
      { id: 4, name: 'Muscular', description: 'Muscle mass and strength' },
      { id: 5, name: 'Skeletal', description: 'Bone health and density' },
      { id: 6, name: 'Digestive', description: 'Gut health and liver function' },
      { id: 7, name: 'Endocrine', description: 'Hormone regulation and metabolism' },
      { id: 8, name: 'Urinary', description: 'Kidney and urinary function' },
      { id: 9, name: 'Reproductive', description: 'Reproductive hormone health' },
      { id: 10, name: 'Integumentary', description: 'Skin, hair, and nail health' },
      { id: 11, name: 'Immune/Inflammation', description: 'Immune system and inflammation markers' },
      { id: 12, name: 'Sensory', description: 'Vision, hearing, and sensory function' },
      { id: 13, name: 'Biological Age', description: 'Cellular aging and longevity markers' }
    ];

    for (const system of healthSystems) {
      await client.query(
        'INSERT INTO health_systems (id, name, description) VALUES ($1, $2, $3)',
        [system.id, system.name, system.description]
      );
    }

    // Recreate uploads table
    await client.query(`
      CREATE TABLE uploads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        file_type VARCHAR(50),
        file_size INTEGER,
        upload_type VARCHAR(50) DEFAULT 'manual',
        storage_path TEXT,
        processing_status VARCHAR(50) DEFAULT 'pending',
        processing_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      );
    `);

    // Recreate metrics table
    await client.query(`
      CREATE TABLE metrics (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
        system_id INTEGER REFERENCES health_systems(id),
        metric_name VARCHAR(255) NOT NULL,
        metric_value DECIMAL,
        metric_unit VARCHAR(50),
        reference_range TEXT,
        is_key_metric BOOLEAN DEFAULT FALSE,
        test_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_metric_date_upload UNIQUE (user_id, metric_name, test_date, upload_id)
      );
    `);

    // Recreate other supporting tables
    await client.query(`
      CREATE TABLE ai_outputs_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        output_type VARCHAR(100) NOT NULL,
        prompt_text TEXT,
        response_text TEXT,
        token_usage INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE user_custom_metrics (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        metric_name VARCHAR(255) NOT NULL,
        metric_category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_custom_metric UNIQUE (user_id, metric_name)
      );
    `);

    await client.query(`
      CREATE TABLE imaging_studies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
        study_type VARCHAR(100),
        study_date DATE,
        findings TEXT,
        ai_analysis TEXT,
        comparison_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE questionnaire_responses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        questionnaire_type VARCHAR(100) NOT NULL,
        responses JSON NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_metrics_user_id ON metrics(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_metrics_system_id ON metrics(system_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_metrics_test_date ON metrics(test_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(processing_status)');

    console.log('🔄 Restoring backed up data...');
    
    // Restore users
    for (const user of usersBackup.rows) {
      await client.query(
        'INSERT INTO users (id, email, google_id, name, avatar_url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING',
        [user.id, user.email, user.google_id, user.name, user.avatar_url, user.created_at, user.updated_at]
      );
    }

    // Restore uploads
    for (const upload of uploadsBackup.rows) {
      await client.query(
        'INSERT INTO uploads (id, user_id, filename, file_type, file_size, upload_type, storage_path, processing_status, processing_error, created_at, processed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [upload.id, upload.user_id, upload.filename, upload.file_type, upload.file_size, upload.upload_type, upload.storage_path, upload.processing_status, upload.processing_error, upload.created_at, upload.processed_at]
      );
    }

    // Restore metrics with proper system mapping
    for (const metric of metricsBackup.rows) {
      // Ensure system_id is valid
      let systemId = metric.system_id;
      if (!systemId || systemId < 1 || systemId > 13) {
        // Map based on metric name if system_id is invalid
        const metricName = metric.metric_name.toLowerCase();
        if (metricName.includes('cholesterol') || metricName.includes('triglyc') || metricName.includes('hdl') || metricName.includes('ldl')) {
          systemId = 1; // Cardiovascular
        } else if (metricName.includes('glucose') || metricName.includes('insulin') || metricName.includes('thyroid')) {
          systemId = 7; // Endocrine
        } else if (metricName.includes('creatinine') || metricName.includes('bun') || metricName.includes('albumin')) {
          systemId = 8; // Urinary
        } else {
          systemId = 1; // Default to Cardiovascular
        }
      }

      await client.query(
        'INSERT INTO metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, test_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (user_id, metric_name, test_date, upload_id) DO NOTHING',
        [metric.id, metric.user_id, metric.upload_id, systemId, metric.metric_name, metric.metric_value, metric.metric_unit, metric.reference_range, metric.is_key_metric, metric.test_date, metric.created_at, metric.updated_at]
      );
    }

    // Reset sequences to avoid ID conflicts
    await client.query("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))");
    await client.query("SELECT setval('uploads_id_seq', (SELECT MAX(id) FROM uploads))");
    await client.query("SELECT setval('metrics_id_seq', (SELECT MAX(id) FROM metrics))");

    console.log('✅ Database reset completed successfully!');
    console.log('📊 Final counts:');
    
    const finalUsers = await client.query('SELECT COUNT(*) FROM users');
    const finalMetrics = await client.query('SELECT COUNT(*) FROM metrics');
    const finalUploads = await client.query('SELECT COUNT(*) FROM uploads');
    
    console.log(`   Users: ${finalUsers.rows[0].count}`);
    console.log(`   Metrics: ${finalMetrics.rows[0].count}`);
    console.log(`   Uploads: ${finalUploads.rows[0].count}`);
    console.log('');
    console.log('🚀 Database is now ready for deployment!');
    
  } catch (error) {
    console.error('❌ Error during database reset:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the reset if this script is executed directly
if (require.main === module) {
  resetDatabaseForDeployment()
    .then(() => {
      console.log('✅ Reset completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Reset failed:', error);
      process.exit(1);
    });
}

module.exports = { resetDatabaseForDeployment };