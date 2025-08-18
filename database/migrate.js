const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { Pool } = require('pg');

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const db = drizzle(pool);

  console.log('Running database migrations...');
  
  try {
    // In production, if reset was done, migrations should work normally
    // In development, handle existing tables gracefully
    
    if (process.env.NODE_ENV === 'production') {
      // Production: Run migrations normally (assumes clean reset was done)
      await migrate(db, { migrationsFolder: './database/migrations' });
      console.log('Production migrations completed successfully');
      return;
    }
    
    // Development: Check if this is a fresh database by looking for the drizzle migrations table
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '__drizzle_migrations'
      );
    `);
    
    const migrationTableExists = result.rows[0].exists;
    
    if (!migrationTableExists) {
      // Fresh database - check if tables already exist from old schema
      const tablesResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `);
      
      if (tablesResult.rows[0].exists) {
        console.log('Development: Existing tables detected, marking as migrated...');
        
        // Create the migrations table and mark initial migration as complete
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
          );
        `);
        
        // Mark the initial migration as complete
        const fs = require('fs');
        const path = require('path');
        const migrationFile = fs.readFileSync('./database/migrations/0000_stiff_leo.sql', 'utf8');
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(migrationFile).digest('hex');
        
        await pool.query(`
          INSERT INTO "__drizzle_migrations" (hash, created_at) 
          VALUES ($1, $2)
        `, [hash, Date.now()]);
        
        console.log('Development: Existing schema marked as migrated');
        return;
      }
    }
    
    // Run normal migrations
    await migrate(db, { migrationsFolder: './database/migrations' });
    console.log('Migrations completed successfully');
  } catch (error) {
    if (error.message?.includes('already exists')) {
      console.log('Tables already exist, skipping migration');
      return;
    }
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch(console.error);
}

module.exports = { runMigrations };