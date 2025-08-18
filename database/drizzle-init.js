const { runMigrations } = require('./migrate');
const { seedHealthSystems } = require('./connection');

/**
 * Initialize database with Drizzle ORM
 * This replaces the old schema.js initialization
 */
async function initializeDrizzleDatabase() {
  console.log('🔧 Initializing database with Drizzle...');
  
  try {
    // Run migrations to create/update schema
    await runMigrations();
    
    // Seed health systems data
    await seedHealthSystems();
    
    console.log('✅ Drizzle database initialization completed');
  } catch (error) {
    console.error('❌ Drizzle database initialization failed:', error);
    throw error;
  }
}

module.exports = { initializeDrizzleDatabase };