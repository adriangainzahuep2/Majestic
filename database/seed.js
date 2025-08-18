const { db, seedHealthSystems } = require('./connection');

async function main() {
  console.log('🌱 Starting database seeding...');
  
  try {
    await seedHealthSystems();
    console.log('✅ Database seeding completed successfully');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };