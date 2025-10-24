#!/usr/bin/env node
// ============================================================================
// Database Initialization Script
// ============================================================================

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('✗ DATABASE_URL environment variable is required');
    process.exit(1);
}

async function initDatabase() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false // For RDS
        }
    });

    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('✓ Connected to database');

        // Test query
        const result = await client.query('SELECT NOW()');
        console.log('✓ Database query successful:', result.rows[0].now);

        // Check if tables exist
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log(`✓ Found ${tablesResult.rows.length} tables in database`);
        
        if (tablesResult.rows.length > 0) {
            console.log('Tables:', tablesResult.rows.map(r => r.table_name).join(', '));
        }

        return true;
    } catch (error) {
        console.error('✗ Database error:', error.message);
        return false;
    } finally {
        await client.end();
    }
}

initDatabase()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
        console.error('✗ Fatal error:', error);
        process.exit(1);
    });
