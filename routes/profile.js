const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ISO country list
const COUNTRIES = [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'AU', name: 'Australia' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'DK', name: 'Denmark' },
    { code: 'FI', name: 'Finland' },
    { code: 'JP', name: 'Japan' },
    { code: 'CN', name: 'China' },
    { code: 'IN', name: 'India' },
    { code: 'BR', name: 'Brazil' },
    { code: 'MX', name: 'Mexico' },
    { code: 'AR', name: 'Argentina' },
    { code: 'CL', name: 'Chile' },
    // Add more countries as needed
].sort((a, b) => a.name.localeCompare(b.name));

// GET /api/profile - Get user profile
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // Get user profile
        const userResult = await req.db.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );
            
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Get chronic conditions
        const chronicConditionsResult = await req.db.query(
            'SELECT * FROM user_chronic_conditions WHERE user_id = $1',
            [userId]
        );
            
        // Get allergies
        const allergiesResult = await req.db.query(
            'SELECT * FROM user_allergies WHERE user_id = $1',
            [userId]
        );
        
        const profile = {
            ...userResult.rows[0],
            chronicConditions: chronicConditionsResult.rows,
            allergies: allergiesResult.rows
        };
        
        res.json({ success: true, profile });
    } catch (error) {
        console.error('Failed to get profile:', error);
        res.status(500).json({ success: false, message: 'Failed to get profile' });
    }
});

// PUT /api/profile - Update user profile
router.put('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const profileData = req.body;
        
        // Extract allergies and chronic conditions from the main data
        const { allergies = [], chronicConditions = [], ...userUpdates } = profileData;
        
        // Build the SQL update query dynamically
        const updateFields = [];
        const values = [];
        let paramIndex = 1;
        
        // Add profile fields to update
        const profileFields = [
            'sex', 'date_of_birth', 'height_feet', 'height_inches', 'height_cm',
            'weight_lbs', 'weight_kg', 'ethnicity', 'country_of_residence',
            'smoker', 'packs_per_week', 'alcohol_drinks_per_week', 'pregnant',
            'pregnancy_start_date', 'cycle_phase'
        ];
        
        profileFields.forEach(field => {
            const camelCaseField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            if (userUpdates[camelCaseField] !== undefined) {
                updateFields.push(`${field} = $${paramIndex}`);
                // Handle empty strings for date fields
                let value = userUpdates[camelCaseField];
                if ((field === 'date_of_birth' || field === 'pregnancy_start_date') && value === '') {
                    value = null;
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
        
        // Update user profile
        const updateQuery = `
            UPDATE users 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        
        const updatedUser = await req.db.query(updateQuery, values);
        
        // Delete existing chronic conditions and allergies
        await req.db.query('DELETE FROM user_chronic_conditions WHERE user_id = $1', [userId]);
        await req.db.query('DELETE FROM user_allergies WHERE user_id = $1', [userId]);
        
        // Insert new chronic conditions
        if (chronicConditions.length > 0) {
            const conditionValues = chronicConditions.map(condition => 
                `(${userId}, '${condition.conditionName.replace(/'/g, "''")}', '${condition.status}', NOW())`
            ).join(', ');
            
            await req.db.query(`
                INSERT INTO user_chronic_conditions (user_id, condition_name, status, created_at)
                VALUES ${conditionValues}
            `);
        }
        
        // Insert new allergies
        if (allergies.length > 0) {
            const allergyValues = allergies.map(allergy => 
                `(${userId}, '${allergy.allergyType}', '${allergy.allergenName.replace(/'/g, "''")}', NOW())`
            ).join(', ');
            
            await req.db.query(`
                INSERT INTO user_allergies (user_id, allergy_type, allergen_name, created_at)
                VALUES ${allergyValues}
            `);
        }
        
        res.json({ 
            success: true, 
            message: 'Profile updated successfully',
            user: updatedUser.rows[0]
        });
    } catch (error) {
        console.error('Failed to update profile:', error);
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