#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../shared/schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const db = drizzle(pool);

async function syncDatabase() {
  console.log('Syncing database schema with Drizzle...');
  
  const client = await pool.connect();
  
  try {
    // Create daily_plans table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_plans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        plan_date DATE NOT NULL,
        plan_data TEXT,
        is_completed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now(),
        UNIQUE(user_id, plan_date)
      )
    `);

    // Create the migrations tracking table for Drizzle
    await client.query(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      )
    `);

    console.log('✅ Database schema synced successfully!');
    console.log('✅ Drizzle ORM is now ready to use');
    
  } catch (error) {
    console.error('❌ Database sync failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

syncDatabase().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});