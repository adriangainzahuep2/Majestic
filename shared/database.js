import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

// Create the connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create the Drizzle database instance
export const db = drizzle(pool, { schema });

// Export the pool for backward compatibility
export { pool };

// Health systems configuration
export const HEALTH_SYSTEMS = [
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
  { id: 13, name: 'Genetics & Biological Age', description: 'Cellular aging and longevity markers' }
];

// Initialize database with health systems
export async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    // Insert health systems if they don't exist
    for (const system of HEALTH_SYSTEMS) {
      await client.query(`
        INSERT INTO health_systems (id, name, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description
      `, [system.id, system.name, system.description]);
    }

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}