#!/usr/bin/env node
const { runMigrations } = require('./database/migrate');

async function main() {
  try {
    await runMigrations();
    process.exit(0);
  } catch (error) {
    console.error('Migration script failed:', error);
    process.exit(1);
  }
}

main();