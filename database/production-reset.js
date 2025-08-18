#!/usr/bin/env node
/**
 * ONE-TIME PRODUCTION RESET SCRIPT
 * This script drops all existing tables and recreates them using Drizzle
 * to ensure proper migration tracking from the start.
 * 
 * WARNING: This will delete all existing data!
 * Only run this ONCE during the initial production deployment.
 */

const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { seedHealthSystems } = require('./connection');

async function productionReset() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  console.log('🚨 PRODUCTION RESET: Starting clean database setup...');
  
  try {
    // Step 1: Drop all existing tables in correct order (respecting foreign keys)
    console.log('📋 Dropping existing tables...');
    
    const dropQueries = [
      'DROP TABLE IF EXISTS metrics CASCADE;',
      'DROP TABLE IF EXISTS uploads CASCADE;', 
      'DROP TABLE IF EXISTS questionnaire_responses CASCADE;',
      'DROP TABLE IF EXISTS ai_outputs_log CASCADE;',
      'DROP TABLE IF EXISTS user_custom_metrics CASCADE;',
      'DROP TABLE IF EXISTS imaging_studies CASCADE;',
      'DROP TABLE IF EXISTS users CASCADE;',
      'DROP TABLE IF EXISTS health_systems CASCADE;',
      'DROP TABLE IF EXISTS __drizzle_migrations CASCADE;'
    ];
    
    for (const query of dropQueries) {
      try {
        await pool.query(query);
        console.log(`✓ ${query}`);
      } catch (error) {
        console.log(`⚠️  ${query} - ${error.message}`);
      }
    }
    
    // Step 2: Run fresh Drizzle migrations
    console.log('🔧 Running fresh Drizzle migrations...');
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: './database/migrations' });
    console.log('✅ Fresh migrations completed');
    
    // Step 3: Seed essential data
    console.log('🌱 Seeding health systems...');
    await seedHealthSystems();
    console.log('✅ Seeding completed');
    
    // Step 4: Verify setup
    console.log('🔍 Verifying database setup...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log('📊 Created tables:', tablesResult.rows.map(r => r.table_name));
    
    // Verify migration tracking
    const migrationsResult = await pool.query('SELECT * FROM __drizzle_migrations;');
    console.log(`📝 Migration tracking active: ${migrationsResult.rows.length} migration(s) recorded`);
    
    console.log('🎉 Production database reset completed successfully!');
    console.log('⚡ Drizzle is now tracking all schema changes at the column level');
    
  } catch (error) {
    console.error('❌ Production reset failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Safety check - only run in production with explicit confirmation
if (process.env.NODE_ENV === 'production' && process.env.CONFIRM_PRODUCTION_RESET === 'true') {
  productionReset().catch(console.error);
} else if (process.env.NODE_ENV !== 'production') {
  console.log('⚠️  This script is for production use only');
  console.log('Set NODE_ENV=production and CONFIRM_PRODUCTION_RESET=true to run');
} else {
  console.log('⚠️  Set CONFIRM_PRODUCTION_RESET=true to confirm you want to reset production database');
  console.log('⚠️  WARNING: This will delete ALL existing data!');
}

module.exports = { productionReset };