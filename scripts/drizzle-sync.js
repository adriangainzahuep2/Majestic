#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';// PUT /api/profile - Update user profile
router.put('/', authMiddleware, async (req, res) => {
    const startTime = Date.now();
    const correlationId = req.correlationId;
    const userId = req.user.userId;
    const profileData = req.body;

    // Create privacy-safe summary of incoming data
    const inputSummary = createProfileSummary(profileData);

    info('PROFILE_API_PUT_START', {
        correlation_id: correlationId,
        user_id: userId,
        route: '/api/profile',
        summary: inputSummary
    });

    try {

        // Extract allergies and chronic conditions from the main data
        const { allergies = [], chronicConditions = [], ...userUpdates } = profileData;

        // Build the SQL update query dynamically - expect snake_case input
        const updateFields = [];
        const values = [];
        let paramIndex = 1;

        // Add profile fields to update - input should be snake_case
        const profileFields = [
            'preferred_unit_system', 'sex', 'date_of_birth', 'height_in', 'weight_lb', 
            'ethnicity', 'country_of_residence', 'smoker', 'packs_per_week', 
            'alcohol_drinks_per_week', 'pregnant', 'pregnancy_start_date', 'cycle_phase'
        ];

        profileFields.forEach(field => {
            if (userUpdates[field] !== undefined) {
                updateFields.push(`${field} = $${paramIndex}`);

                // Normalize input values
                let value = userUpdates[field];

                // Handle empty strings -> null
                if (value === '') {
                    value = null;
                }
                // Parse numbers for numeric fields
                else if (['height_in', 'weight_lb', 'packs_per_week', 'alcohol_drinks_per_week'].includes(field) && value !== null) {
                    value = Number(value);
                }
                // Parse booleans for boolean fields
                else if (['smoker', 'pregnant'].includes(field) && value !== null) {
                    if (value === 'true') value = true;
                    else if (value === 'false') value = false;
                    else if (value === true || value === false) value = value;
                    else value = null;
                }
                // Validate ISO dates
                else if (['date_of_birth', 'pregnancy_start_date'].includes(field) && value !== null) {
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!dateRegex.test(value)) {
                        value = null; // Invalid date format
                    }
                }

                values.push(value);
                paramIndex++;
            }
        });

        // Always update these fields
        updateFields.push(`profile_completed = $${paramIndex}`);
        values.push(true);
        paramIndex++;

        updateFields.push(`profile_updated_at = $${paramIndex}`);
        values.push(new Date());
        paramIndex++;

        updateFields.push(`updated_at = $${paramIndex}`);
        values.push(new Date());
        paramIndex++;

        values.push(userId); // WHERE clause parameter

        // Update user profile - log DB operation
        const userDbStart = Date.now();
        info('PROFILE_DB_UPDATE_START', {
            correlation_id: correlationId,
            user_id: userId,
            query: 'users_update',
            field_count: updateFields.length
        });

        const updateQuery = `
            UPDATE users 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;

        const updatedUser = await req.db.query(updateQuery, values);

        info('PROFILE_DB_UPDATE_END', {
            correlation_id: correlationId,
            user_id: userId,
            query: 'users_update',
            row_count: updatedUser.rows.length,
            duration_ms: Date.now() - userDbStart
        });

        // Delete existing chronic conditions and allergies
        const deleteConditionsStart = Date.now();
        info('PROFILE_DB_UPDATE_START', {
            correlation_id: correlationId,
            user_id: userId,
            query: 'chronic_conditions_delete'
        });

        const deletedConditions = await req.db.query('DELETE FROM user_chronic_conditions WHERE user_id = $1', [userId]);

        info('PROFILE_DB_UPDATE_END', {
            correlation_id: correlationId,
            user_id: userId,
            query: 'chronic_conditions_delete',
            row_count: deletedConditions.rowCount || 0,
            duration_ms: Date.now() - deleteConditionsStart
        });

        const deleteAllergiesStart = Date.now();
        info('PROFILE_DB_UPDATE_START', {
            correlation_id: correlationId,
            user_id: userId,
            query: 'allergies_delete'
        });

        const deletedAllergies = await req.db.query('DELETE FROM user_allergies WHERE user_id = $1', [userId]);

        info('PROFILE_DB_UPDATE_END', {
            correlation_id: correlationId,
            user_id: userId,
            query: 'allergies_delete',
            row_count: deletedAllergies.rowCount || 0,
            duration_ms: Date.now() - deleteAllergiesStart
        });

        // Insert new chronic conditions
        if (chronicConditions.length > 0) {
            const insertConditionsStart = Date.now();
            info('PROFILE_DB_UPDATE_START', {
                correlation_id: correlationId,
                user_id: userId,
                query: 'chronic_conditions_insert',
                record_count: chronicConditions.length
            });

            const conditionValues = chronicConditions.map(condition => 
                `(${userId}, '${condition.conditionName.replace(/'/g, "''")}', '${condition.status}', NOW())`
            ).join(', ');

            const insertedConditions = await req.db.query(`
                INSERT INTO user_chronic_conditions (user_id, condition_name, status, created_at)
                VALUES ${conditionValues}
            `);

            info('PROFILE_DB_UPDATE_END', {
                correlation_id: correlationId,
                user_id: userId,
                query: 'chronic_conditions_insert',
                row_count: insertedConditions.rowCount || 0,
                duration_ms: Date.now() - insertConditionsStart
            });
        }

        // Insert new allergies
        if (allergies.length > 0) {
            const insertAllergiesStart = Date.now();
            info('PROFILE_DB_UPDATE_START', {
                correlation_id: correlationId,
                user_id: userId,
                query: 'allergies_insert',
                record_count: allergies.length
            });

            const allergyValues = allergies.map(allergy => 
                `(${userId}, '${allergy.allergyType}', '${allergy.allergenName.replace(/'/g, "''")}', NOW())`
            ).join(', ');

            const insertedAllergies = await req.db.query(`
                INSERT INTO user_allergies (user_id, allergy_type, allergen_name, created_at)
                VALUES ${allergyValues}
            `);

            info('PROFILE_DB_UPDATE_END', {
                correlation_id: correlationId,
                user_id: userId,
                query: 'allergies_insert',
                row_count: insertedAllergies.rowCount || 0,
                duration_ms: Date.now() - insertAllergiesStart
            });
        }

        // Return flat updated profile object with snake_case keys
        const updatedUserData = updatedUser.rows[0];
        const updatedProfile = {
            sex: updatedUserData.sex ?? null,
            date_of_birth: updatedUserData.date_of_birth ?? null,
            height_in: updatedUserData.height_in ?? null,
            weight_lb: updatedUserData.weight_lb ?? null,
            preferred_unit_system: updatedUserData.preferred_unit_system ?? 'US',
            country_of_residence: updatedUserData.country_of_residence ?? null,
            ethnicity: updatedUserData.ethnicity ?? null,
            smoker: updatedUserData.smoker ?? null,
            packs_per_week: updatedUserData.packs_per_week ?? null,
            alcohol_drinks_per_week: updatedUserData.alcohol_drinks_per_week ?? null,
            pregnant: updatedUserData.pregnant ?? null,
            pregnancy_start_date: updatedUserData.pregnancy_start_date ?? null,
            cycle_phase: updatedUserData.cycle_phase ?? null
        };

        // Create privacy-safe summary of updated profile
        const outputSummary = createProfileSummary(updatedProfile);

        info('PROFILE_API_PUT_SUCCESS', {
            correlation_id: correlationId,
            user_id: userId,
            route: '/api/profile',
            duration_ms: Date.now() - startTime,
            summary: outputSummary
        });

        res.setHeader('Content-Type', 'application/json');
        res.json(updatedProfile);
    } catch (err) {
        error('PROFILE_API_PUT_ERROR', {
            correlation_id: correlationId,
            user_id: userId,
            route: '/api/profile',
            error_name: err.name || 'UNKNOWN_ERROR',
            status: 500,
            duration_ms: Date.now() - startTime
        });

        console.error('Failed to update profile:', err);
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

// GET /api/profile/countries - Get country list
router.get('/countries', (req, res) => {
    try {
        res.json({ success: true, countries: COUNTRIES });
    } catch (error) {
        console.error('Failed to get countries:', error);
        res.status(500).json({ success: false, message: 'Failed to get countries' });
    }
});

// GET /api/profile/conditions - Get available chronic conditions (scaffold)
router.get('/conditions', (req, res) => {
    try {
        // For now, return empty array as per requirements
        // Will be populated later with actual condition list
        res.json({ success: true, conditions: [] });
    } catch (error) {
        console.error('Failed to get conditions:', error);
        res.status(500).json({ success: false, message: 'Failed to get conditions' });
    }
});

module.exports = router;
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