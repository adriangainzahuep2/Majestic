const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ISO Alpha-2 country list
const COUNTRIES = [
    { code: 'AD', name: 'Andorra' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'AF', name: 'Afghanistan' },
    { code: 'AG', name: 'Antigua and Barbuda' },
    { code: 'AI', name: 'Anguilla' },
    { code: 'AL', name: 'Albania' },
    { code: 'AM', name: 'Armenia' },
    { code: 'AO', name: 'Angola' },
    { code: 'AQ', name: 'Antarctica' },
    { code: 'AR', name: 'Argentina' },
    { code: 'AS', name: 'American Samoa' },
    { code: 'AT', name: 'Austria' },
    { code: 'AU', name: 'Australia' },
    { code: 'AW', name: 'Aruba' },
    { code: 'AX', name: 'Aland Islands' },
    { code: 'AZ', name: 'Azerbaijan' },
    { code: 'BA', name: 'Bosnia and Herzegovina' },
    { code: 'BB', name: 'Barbados' },
    { code: 'BD', name: 'Bangladesh' },
    { code: 'BE', name: 'Belgium' },
    { code: 'BF', name: 'Burkina Faso' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'BH', name: 'Bahrain' },
    { code: 'BI', name: 'Burundi' },
    { code: 'BJ', name: 'Benin' },
    { code: 'BL', name: 'Saint Barthelemy' },
    { code: 'BM', name: 'Bermuda' },
    { code: 'BN', name: 'Brunei Darussalam' },
    { code: 'BO', name: 'Bolivia' },
    { code: 'BQ', name: 'Bonaire, Sint Eustatius and Saba' },
    { code: 'BR', name: 'Brazil' },
    { code: 'BS', name: 'Bahamas' },
    { code: 'BT', name: 'Bhutan' },
    { code: 'BV', name: 'Bouvet Island' },
    { code: 'BW', name: 'Botswana' },
    { code: 'BY', name: 'Belarus' },
    { code: 'BZ', name: 'Belize' },
    { code: 'CA', name: 'Canada' },
    { code: 'CC', name: 'Cocos (Keeling) Islands' },
    { code: 'CD', name: 'Congo, Democratic Republic of the' },
    { code: 'CF', name: 'Central African Republic' },
    { code: 'CG', name: 'Congo' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'CI', name: 'Cote d\'Ivoire' },
    { code: 'CK', name: 'Cook Islands' },
    { code: 'CL', name: 'Chile' },
    { code: 'CM', name: 'Cameroon' },
    { code: 'CN', name: 'China' },
    { code: 'CO', name: 'Colombia' },
    { code: 'CR', name: 'Costa Rica' },
    { code: 'CU', name: 'Cuba' },
    { code: 'CV', name: 'Cape Verde' },
    { code: 'CW', name: 'Curacao' },
    { code: 'CX', name: 'Christmas Island' },
    { code: 'CY', name: 'Cyprus' },
    { code: 'CZ', name: 'Czech Republic' },
    { code: 'DE', name: 'Germany' },
    { code: 'DJ', name: 'Djibouti' },
    { code: 'DK', name: 'Denmark' },
    { code: 'DM', name: 'Dominica' },
    { code: 'DO', name: 'Dominican Republic' },
    { code: 'DZ', name: 'Algeria' },
    { code: 'EC', name: 'Ecuador' },
    { code: 'EE', name: 'Estonia' },
    { code: 'EG', name: 'Egypt' },
    { code: 'EH', name: 'Western Sahara' },
    { code: 'ER', name: 'Eritrea' },
    { code: 'ES', name: 'Spain' },
    { code: 'ET', name: 'Ethiopia' },
    { code: 'FI', name: 'Finland' },
    { code: 'FJ', name: 'Fiji' },
    { code: 'FK', name: 'Falkland Islands (Malvinas)' },
    { code: 'FM', name: 'Micronesia, Federated States of' },
    { code: 'FO', name: 'Faroe Islands' },
    { code: 'FR', name: 'France' },
    { code: 'GA', name: 'Gabon' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'GD', name: 'Grenada' },
    { code: 'GE', name: 'Georgia' },
    { code: 'GF', name: 'French Guiana' },
    { code: 'GG', name: 'Guernsey' },
    { code: 'GH', name: 'Ghana' },
    { code: 'GI', name: 'Gibraltar' },
    { code: 'GL', name: 'Greenland' },
    { code: 'GM', name: 'Gambia' },
    { code: 'GN', name: 'Guinea' },
    { code: 'GP', name: 'Guadeloupe' },
    { code: 'GQ', name: 'Equatorial Guinea' },
    { code: 'GR', name: 'Greece' },
    { code: 'GS', name: 'South Georgia and the South Sandwich Islands' },
    { code: 'GT', name: 'Guatemala' },
    { code: 'GU', name: 'Guam' },
    { code: 'GW', name: 'Guinea-Bissau' },
    { code: 'GY', name: 'Guyana' },
    { code: 'HK', name: 'Hong Kong' },
    { code: 'HM', name: 'Heard Island and McDonald Islands' },
    { code: 'HN', name: 'Honduras' },
    { code: 'HR', name: 'Croatia' },
    { code: 'HT', name: 'Haiti' },
    { code: 'HU', name: 'Hungary' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'IE', name: 'Ireland' },
    { code: 'IL', name: 'Israel' },
    { code: 'IM', name: 'Isle of Man' },
    { code: 'IN', name: 'India' },
    { code: 'IO', name: 'British Indian Ocean Territory' },
    { code: 'IQ', name: 'Iraq' },
    { code: 'IR', name: 'Iran, Islamic Republic of' },
    { code: 'IS', name: 'Iceland' },
    { code: 'IT', name: 'Italy' },
    { code: 'JE', name: 'Jersey' },
    { code: 'JM', name: 'Jamaica' },
    { code: 'JO', name: 'Jordan' },
    { code: 'JP', name: 'Japan' },
    { code: 'KE', name: 'Kenya' },
    { code: 'KG', name: 'Kyrgyzstan' },
    { code: 'KH', name: 'Cambodia' },
    { code: 'KI', name: 'Kiribati' },
    { code: 'KM', name: 'Comoros' },
    { code: 'KN', name: 'Saint Kitts and Nevis' },
    { code: 'KP', name: 'Korea, Democratic People\'s Republic of' },
    { code: 'KR', name: 'Korea, Republic of' },
    { code: 'KW', name: 'Kuwait' },
    { code: 'KY', name: 'Cayman Islands' },
    { code: 'KZ', name: 'Kazakhstan' },
    { code: 'LA', name: 'Lao People\'s Democratic Republic' },
    { code: 'LB', name: 'Lebanon' },
    { code: 'LC', name: 'Saint Lucia' },
    { code: 'LI', name: 'Liechtenstein' },
    { code: 'LK', name: 'Sri Lanka' },
    { code: 'LR', name: 'Liberia' },
    { code: 'LS', name: 'Lesotho' },
    { code: 'LT', name: 'Lithuania' },
    { code: 'LU', name: 'Luxembourg' },
    { code: 'LV', name: 'Latvia' },
    { code: 'LY', name: 'Libya' },
    { code: 'MA', name: 'Morocco' },
    { code: 'MC', name: 'Monaco' },
    { code: 'MD', name: 'Moldova, Republic of' },
    { code: 'ME', name: 'Montenegro' },
    { code: 'MF', name: 'Saint Martin (French part)' },
    { code: 'MG', name: 'Madagascar' },
    { code: 'MH', name: 'Marshall Islands' },
    { code: 'MK', name: 'Macedonia, the former Yugoslav Republic of' },
    { code: 'ML', name: 'Mali' },
    { code: 'MM', name: 'Myanmar' },
    { code: 'MN', name: 'Mongolia' },
    { code: 'MO', name: 'Macao' },
    { code: 'MP', name: 'Northern Mariana Islands' },
    { code: 'MQ', name: 'Martinique' },
    { code: 'MR', name: 'Mauritania' },
    { code: 'MS', name: 'Montserrat' },
    { code: 'MT', name: 'Malta' },
    { code: 'MU', name: 'Mauritius' },
    { code: 'MV', name: 'Maldives' },
    { code: 'MW', name: 'Malawi' },
    { code: 'MX', name: 'Mexico' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'MZ', name: 'Mozambique' },
    { code: 'NA', name: 'Namibia' },
    { code: 'NC', name: 'New Caledonia' },
    { code: 'NE', name: 'Niger' },
    { code: 'NF', name: 'Norfolk Island' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'NI', name: 'Nicaragua' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'NO', name: 'Norway' },
    { code: 'NP', name: 'Nepal' },
    { code: 'NR', name: 'Nauru' },
    { code: 'NU', name: 'Niue' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'OM', name: 'Oman' },
    { code: 'PA', name: 'Panama' },
    { code: 'PE', name: 'Peru' },
    { code: 'PF', name: 'French Polynesia' },
    { code: 'PG', name: 'Papua New Guinea' },
    { code: 'PH', name: 'Philippines' },
    { code: 'PK', name: 'Pakistan' },
    { code: 'PL', name: 'Poland' },
    { code: 'PM', name: 'Saint Pierre and Miquelon' },
    { code: 'PN', name: 'Pitcairn' },
    { code: 'PR', name: 'Puerto Rico' },
    { code: 'PS', name: 'Palestinian Territory, Occupied' },
    { code: 'PT', name: 'Portugal' },
    { code: 'PW', name: 'Palau' },
    { code: 'PY', name: 'Paraguay' },
    { code: 'QA', name: 'Qatar' },
    { code: 'RE', name: 'Reunion' },
    { code: 'RO', name: 'Romania' },
    { code: 'RS', name: 'Serbia' },
    { code: 'RU', name: 'Russian Federation' },
    { code: 'RW', name: 'Rwanda' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'SB', name: 'Solomon Islands' },
    { code: 'SC', name: 'Seychelles' },
    { code: 'SD', name: 'Sudan' },
    { code: 'SE', name: 'Sweden' },
    { code: 'SG', name: 'Singapore' },
    { code: 'SH', name: 'Saint Helena, Ascension and Tristan da Cunha' },
    { code: 'SI', name: 'Slovenia' },
    { code: 'SJ', name: 'Svalbard and Jan Mayen' },
    { code: 'SK', name: 'Slovakia' },
    { code: 'SL', name: 'Sierra Leone' },
    { code: 'SM', name: 'San Marino' },
    { code: 'SN', name: 'Senegal' },
    { code: 'SO', name: 'Somalia' },
    { code: 'SR', name: 'Suriname' },
    { code: 'SS', name: 'South Sudan' },
    { code: 'ST', name: 'Sao Tome and Principe' },
    { code: 'SV', name: 'El Salvador' },
    { code: 'SX', name: 'Sint Maarten (Dutch part)' },
    { code: 'SY', name: 'Syrian Arab Republic' },
    { code: 'SZ', name: 'Swaziland' },
    { code: 'TC', name: 'Turks and Caicos Islands' },
    { code: 'TD', name: 'Chad' },
    { code: 'TF', name: 'French Southern Territories' },
    { code: 'TG', name: 'Togo' },
    { code: 'TH', name: 'Thailand' },
    { code: 'TJ', name: 'Tajikistan' },
    { code: 'TK', name: 'Tokelau' },
    { code: 'TL', name: 'Timor-Leste' },
    { code: 'TM', name: 'Turkmenistan' },
    { code: 'TN', name: 'Tunisia' },
    { code: 'TO', name: 'Tonga' },
    { code: 'TR', name: 'Turkey' },
    { code: 'TT', name: 'Trinidad and Tobago' },
    { code: 'TV', name: 'Tuvalu' },
    { code: 'TW', name: 'Taiwan' },
    { code: 'TZ', name: 'Tanzania, United Republic of' },
    { code: 'UA', name: 'Ukraine' },
    { code: 'UG', name: 'Uganda' },
    { code: 'UM', name: 'United States Minor Outlying Islands' },
    { code: 'US', name: 'United States' },
    { code: 'UY', name: 'Uruguay' },
    { code: 'UZ', name: 'Uzbekistan' },
    { code: 'VA', name: 'Holy See (Vatican City State)' },
    { code: 'VC', name: 'Saint Vincent and the Grenadines' },
    { code: 'VE', name: 'Venezuela, Bolivarian Republic of' },
    { code: 'VG', name: 'Virgin Islands, British' },
    { code: 'VI', name: 'Virgin Islands, U.S.' },
    { code: 'VN', name: 'Viet Nam' },
    { code: 'VU', name: 'Vanuatu' },
    { code: 'WF', name: 'Wallis and Futuna' },
    { code: 'WS', name: 'Samoa' },
    { code: 'YE', name: 'Yemen' },
    { code: 'YT', name: 'Mayotte' },
    { code: 'ZA', name: 'South Africa' },
    { code: 'ZM', name: 'Zambia' },
    { code: 'ZW', name: 'Zimbabwe' }
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
            'preferred_unit_system', 'sex', 'date_of_birth', 'height_in', 'weight_lb', 
            'ethnicity', 'country_of_residence', 'smoker', 'packs_per_week', 
            'alcohol_drinks_per_week', 'pregnant', 'pregnancy_start_date', 'cycle_phase'
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