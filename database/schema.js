const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Health systems configuration
const HEALTH_SYSTEMS = [
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

// Initialize database schema
async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        google_id VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS health_systems (
        id INTEGER PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS uploads (
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
        system_id INTEGER REFERENCES health_systems(id),
        metric_name VARCHAR(255) NOT NULL,
        metric_value DECIMAL,
        metric_unit VARCHAR(50),
        reference_range TEXT,
        is_key_metric BOOLEAN DEFAULT false,
        is_outlier BOOLEAN DEFAULT false,
        test_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, metric_name, test_date, upload_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS questionnaire_responses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        question_type VARCHAR(255) NOT NULL,
        question TEXT NOT NULL,
        response TEXT NOT NULL,
        response_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_outputs_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        output_type VARCHAR(100) NOT NULL,
        prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        model_version VARCHAR(50) DEFAULT 'gpt-4o',
        processing_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create imaging_studies table for Phase 1 visual pipeline
    await client.query(`
      CREATE TABLE IF NOT EXISTS imaging_studies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        linked_system_id INTEGER REFERENCES health_systems(id),
        study_type VARCHAR(100),
        file_url TEXT,
        thumbnail_url TEXT,
        test_date DATE,
        ai_summary TEXT,
        metrics_json JSONB,
        comparison_summary TEXT,
        metric_changes_json JSONB,
        status VARCHAR(50) DEFAULT 'pendingProcessing',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert health systems
    for (const system of HEALTH_SYSTEMS) {
      await client.query(`
        INSERT INTO health_systems (id, name, description) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, 
          description = EXCLUDED.description
      `, [system.id, system.name, system.description]);
    }

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_metrics_user_system ON metrics(user_id, system_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_test_date ON metrics(test_date);
      CREATE INDEX IF NOT EXISTS idx_uploads_user_status ON uploads(user_id, processing_status);
      CREATE INDEX IF NOT EXISTS idx_ai_outputs_user_type ON ai_outputs_log(user_id, output_type);
      CREATE INDEX IF NOT EXISTS idx_imaging_studies_user_system ON imaging_studies(user_id, linked_system_id);
      CREATE INDEX IF NOT EXISTS idx_imaging_studies_type_date ON imaging_studies(study_type, test_date);
    `);

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initializeDatabase,
  HEALTH_SYSTEMS
};
