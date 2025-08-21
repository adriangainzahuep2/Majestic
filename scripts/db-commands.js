#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../shared/schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const db = drizzle(pool, { schema });

const command = process.argv[2];

async function runCommand() {
  switch (command) {
    case 'reset':
      await resetDatabase();
      break;
    case 'seed':
      await seedDatabase();
      break;
    case 'status':
      await databaseStatus();
      break;
    default:
      console.log('Available commands:');
      console.log('  node scripts/db-commands.js reset   - Reset all tables');
      console.log('  node scripts/db-commands.js seed    - Seed with health systems');
      console.log('  node scripts/db-commands.js status  - Show database status');
  }
  
  await pool.end();
}

async function resetDatabase() {
  console.log('⚠️  Resetting database...');
  const client = await pool.connect();
  
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    console.log('✅ Database reset complete');
  } finally {
    client.release();
  }
}

async function seedDatabase() {
  console.log('🌱 Seeding database with health systems...');
  const client = await pool.connect();
  
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
    { id: 13, name: 'Genetics & Biological Age', description: 'Cellular aging and longevity markers' }
  ];
  
  try {
    for (const system of HEALTH_SYSTEMS) {
      await client.query(`
        INSERT INTO health_systems (id, name, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description
      `, [system.id, system.name, system.description]);
    }
    console.log('✅ Health systems seeded successfully');
  } finally {
    client.release();
  }
}

async function databaseStatus() {
  console.log('📊 Database Status:');
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        schemaname,
        relname as tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes
      FROM pg_stat_user_tables 
      ORDER BY relname
    `);
    
    console.table(result.rows);
  } finally {
    client.release();
  }
}

runCommand().catch((error) => {
  console.error('Command failed:', error);
  process.exit(1);
});