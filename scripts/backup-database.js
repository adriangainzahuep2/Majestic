#!/usr/bin/env node

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createDatabaseSnapshot() {
  console.log('🔄 Creating database snapshot...');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = 'backups';
  const snapshotFile = path.join(backupDir, `health_app_snapshot_${timestamp}.sql`);
  
  // Create backups directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }
  
  const client = await pool.connect();
  
  try {
    console.log('📊 Gathering database information...');
    
    // Get all tables in public schema
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    let sqlDump = `-- Database Snapshot Created: ${new Date().toISOString()}\n`;
    sqlDump += `-- Environment: ${process.env.NODE_ENV || 'development'}\n`;
    sqlDump += `-- Tables: ${tablesResult.rows.length}\n\n`;
    
    // Add table structure and data for each table
    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      console.log(`📋 Backing up table: ${tableName}`);
      
      // Get table structure
      const structureResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);
      
      sqlDump += `-- Table: ${tableName}\n`;
      sqlDump += `-- Columns: ${structureResult.rows.length}\n`;
      
      // Get row count
      const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = countResult.rows[0].count;
      sqlDump += `-- Rows: ${rowCount}\n\n`;
      
      if (parseInt(rowCount) > 0) {
        // Export data
        const dataResult = await client.query(`SELECT * FROM ${tableName}`);
        
        if (dataResult.rows.length > 0) {
          const columns = Object.keys(dataResult.rows[0]);
          sqlDump += `-- Data for ${tableName}\n`;
          
          for (const row of dataResult.rows) {
            const values = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
              if (value instanceof Date) return `'${value.toISOString()}'`;
              return value;
            }).join(', ');
            
            sqlDump += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values});\n`;
          }
          sqlDump += '\n';
        }
      }
    }
    
    // Write snapshot to file
    fs.writeFileSync(snapshotFile, sqlDump);
    
    console.log('✅ Database snapshot created successfully!');
    console.log(`📁 File: ${snapshotFile}`);
    console.log(`💾 Size: ${(fs.statSync(snapshotFile).size / 1024).toFixed(2)} KB`);
    
    // Create metadata file
    const metadataFile = path.join(backupDir, `metadata_${timestamp}.json`);
    const metadata = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database_url: process.env.DATABASE_URL ? 'configured' : 'default',
      tables: tablesResult.rows.length,
      snapshot_file: snapshotFile,
      created_by: 'development_backup_script'
    };
    
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    
    console.log(`📋 Metadata: ${metadataFile}`);
    
    return {
      snapshotFile,
      metadataFile,
      tableCount: tablesResult.rows.length
    };
    
  } catch (error) {
    console.error('❌ Snapshot creation failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function listSnapshots() {
  const backupDir = 'backups';
  
  if (!fs.existsSync(backupDir)) {
    console.log('📁 No backup directory found');
    return;
  }
  
  const files = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
    .reverse();
  
  console.log('📊 Available snapshots:');
  console.log('========================');
  
  for (const file of files) {
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    const size = (stats.size / 1024).toFixed(2);
    
    console.log(`📁 ${file}`);
    console.log(`   📅 Created: ${stats.birthtime.toISOString()}`);
    console.log(`   💾 Size: ${size} KB`);
    console.log('');
  }
}

const command = process.argv[2];

switch (command) {
  case 'create':
    createDatabaseSnapshot().catch(error => {
      console.error('Backup failed:', error);
      process.exit(1);
    });
    break;
  case 'list':
    listSnapshots();
    break;
  default:
    console.log('Database Snapshot Tool');
    console.log('=====================');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/backup-database.js create  - Create new snapshot');
    console.log('  node scripts/backup-database.js list    - List existing snapshots');
    break;
}