const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const schema = require('./drizzle-schema.js');

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create Drizzle instance with schema
const db = drizzle(pool, { schema });

// Health systems data
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

// Initialize health systems data
async function seedHealthSystems() {
  try {
    console.log('Seeding health systems...');
    
    for (const system of HEALTH_SYSTEMS) {
      await db.insert(schema.healthSystems)
        .values(system)
        .onConflictDoUpdate({
          target: schema.healthSystems.id,
          set: {
            name: system.name,
            description: system.description
          }
        });
    }
    
    console.log('Health systems seeded successfully');
  } catch (error) {
    console.error('Error seeding health systems:', error);
    throw error;
  }
}

module.exports = {
  db,
  pool,
  schema,
  HEALTH_SYSTEMS,
  seedHealthSystems
};