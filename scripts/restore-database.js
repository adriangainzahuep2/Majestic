#!/usr/bin/env node

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function restoreFromSnapshot(snapshotFile) {
  console.log(`🔄 Restoring database from: ${snapshotFile}`);
  
  if (!fs.existsSync(snapshotFile)) {
    console.error(`❌ Snapshot file not found: ${snapshotFile}`);
    process.exit(1);
  }
  
  const client = await pool.connect();
  
  try {
    // Read the SQL file
    const sqlContent = fs.readFileSync(snapshotFile, 'utf8');
    
    console.log('⚠️  WARNING: This will clear all existing data!');
    console.log('📊 Clearing existing data...');
    
    // Get all tables to clear
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    // Disable foreign key checks temporarily
    await client.query('SET session_replication_role = replica;');
    
    // Clear all tables
    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      console.log(`🗑️  Clearing table: ${tableName}`);
      await client.query(`TRUNCATE TABLE ${tableName} CASCADE`);
    }
    
    // Execute the restore SQL
    console.log('📥 Restoring data from snapshot...');
    
    // Split SQL into individual statements and execute
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        await client.query(statement);
      }
    }
    
    // Re-enable foreign key checks
    await client.query('SET session_replication_role = DEFAULT;');
    
    console.log('✅ Database restored successfully!');
    console.log(`📁 Restored from: ${snapshotFile}`);
    
  } catch (error) {
    console.error('❌ Restore failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function listAvailableSnapshots() {
  const backupDir = 'backups';
  
  if (!fs.existsSync(backupDir)) {
    console.log('📁 No backup directory found');
    return [];
  }
  
  const snapshots = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .reverse();
  
  console.log('📊 Available snapshots:');
  console.log('========================');
  
  snapshots.forEach((file, index) => {
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    const size = (stats.size / 1024).toFixed(2);
    
    console.log(`${index + 1}. ${file}`);
    console.log(`   📅 Created: ${stats.birthtime.toLocaleString()}`);
    console.log(`   💾 Size: ${size} KB`);
    console.log('');
  });
  
  return snapshots;
}

const command = process.argv[2];
const snapshotArg = process.argv[3];

switch (command) {
  case 'restore':
    if (!snapshotArg) {
      console.log('❌ Please specify a snapshot file');
      console.log('Usage: node scripts/restore-database.js restore <snapshot-file>');
      console.log('');
      listAvailableSnapshots();
      process.exit(1);
    }
    
    const snapshotPath = snapshotArg.startsWith('backups/') 
      ? snapshotArg 
      : path.join('backups', snapshotArg);
    
    restoreFromSnapshot(snapshotPath).catch(error => {
      console.error('Restore failed:', error);
      process.exit(1);
    });
    break;
    
  case 'list':
    listAvailableSnapshots();
    break;
    
  default:
    console.log('Database Restore Tool');
    console.log('====================');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/restore-database.js list                    - List available snapshots');
    console.log('  node scripts/restore-database.js restore <snapshot-file> - Restore from snapshot');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/restore-database.js restore health_app_snapshot_2025-08-19T12-00-00-000Z.sql');
    break;
}