'use strict';

/**
 * Database Snapshot Tool (CommonJS)
 *
 * Creates a portable SQL snapshot by generating INSERT statements
 * for all tables in the public schema. Also writes a small metadata JSON.
 *
 * This is intended as a fallback when pg_dump is not available.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

/**
 * Create a configured pg Pool.
 */
function createPool() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/health_app';
  const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;

  return new Pool({ connectionString, ssl });
}

/**
 * Quote an identifier (table/column) with double-quotes.
 */
function quoteIdentifier(identifier) {
  return '"' + String(identifier).replace(/"/g, '""') + '"';
}

/**
 * Convert a JS value to a SQL literal.
 */
function toSqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';

  const type = typeof value;
  if (type === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (type === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  // Date
  if (value instanceof Date) {
    return '\'' + value.toISOString().replace(/'/g, "''") + '\'';
  }

  // Buffer → hex-escaped bytea
  if (Buffer.isBuffer(value)) {
    return "E'\\\\x" + value.toString('hex') + "'::bytea";
  }

  // Arrays / objects → JSON text
  if (Array.isArray(value) || (type === 'object' && value)) {
    const json = JSON.stringify(value);
    return '\'' + json.replace(/'/g, "''") + '\'';
  }

  // Strings (default)
  return '\'' + String(value).replace(/'/g, "''") + '\'';
}

/**
 * Ensure backups directory exists.
 */
function ensureBackupDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Create a database snapshot with INSERT statements.
 */
async function createDatabaseSnapshot() {
  const pool = createPool();
  const client = await pool.connect();

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'backups');
    const snapshotFile = path.join(backupDir, `health_app_snapshot_${timestamp}.sql`);
    const metadataFile = path.join(backupDir, `metadata_${timestamp}.json`);

    ensureBackupDir(backupDir);

    // Discover tables in public schema
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    /**
     * Start building dump content
     */
    let sqlDump = '';
    sqlDump += `-- Database Snapshot Created: ${new Date().toISOString()}\n`;
    sqlDump += `-- Environment: ${process.env.NODE_ENV || 'development'}\n`;
    sqlDump += `-- Tables: ${tablesResult.rows.length}\n`;
    sqlDump += `SET client_min_messages TO WARNING;\n`;
    sqlDump += `SET standard_conforming_strings = on;\n`;
    sqlDump += `BEGIN;\n\n`;

    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      const qTable = `public.${quoteIdentifier(tableName)}`;

      // Column order
      const colsResult = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
        [tableName]
      );
      const columnNames = colsResult.rows.map(r => r.column_name);

      sqlDump += `-- Table: ${tableName}\n`;

      // Row count
      const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${qTable}`);
      const rowCount = countResult.rows[0].count || 0;
      sqlDump += `-- Rows: ${rowCount}\n`;

      if (rowCount > 0) {
        const dataResult = await client.query(`SELECT * FROM ${qTable}`);

        // Batch INSERTs
        const quotedCols = columnNames.map(quoteIdentifier).join(', ');
        for (const record of dataResult.rows) {
          const values = columnNames.map(col => toSqlLiteral(record[col])).join(', ');
          sqlDump += `INSERT INTO ${qTable} (${quotedCols}) VALUES (${values});\n`;
        }
        sqlDump += `\n`;
      }
    }

    sqlDump += `COMMIT;\n`;

    // Write dump file
    fs.writeFileSync(snapshotFile, sqlDump);

    // Metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database_url: process.env.DATABASE_URL ? 'configured' : 'default',
      tables: tablesResult.rows.length,
      snapshot_file: path.basename(snapshotFile)
    };
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    console.log(`✅ Database snapshot created`);
    console.log(`📁 File: ${snapshotFile}`);
    console.log(`📝 Metadata: ${metadataFile}`);

    return { snapshotFile, metadataFile };
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * List snapshots in backups directory.
 */
function listSnapshots() {
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    console.log('📁 No backup directory found');
    return;
  }

  const files = fs
    .readdirSync(backupDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse();

  console.log('📊 Available snapshots');
  console.log('======================');
  for (const f of files) {
    const filePath = path.join(backupDir, f);
    const stats = fs.statSync(filePath);
    const kb = (stats.size / 1024).toFixed(2);
    console.log(`- ${f}`);
    console.log(`  Created: ${stats.birthtime.toISOString()}`);
    console.log(`  Size: ${kb} KB`);
  }
}

async function main() {
  const command = process.argv[2] || 'create';
  if (command === 'create') {
    await createDatabaseSnapshot();
  } else if (command === 'list') {
    listSnapshots();
  } else {
    console.log('Database Snapshot Tool (CJS)');
    console.log('============================');
    console.log('Usage:');
    console.log('  node scripts/backup-database.cjs create  # Create new snapshot');
    console.log('  node scripts/backup-database.cjs list    # List snapshots');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Snapshot failed:', error && error.message ? error.message : error);
    process.exit(1);
  });
}



