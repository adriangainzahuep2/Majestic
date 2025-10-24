/**
 * Reference Range Service
 * Provides correct reference ranges based on user profile
 * Fixes: HDL showing wrong range (0-130 instead of 40-100)
 */

// Default reference ranges by metric ID
const DEFAULT_RANGES = {
  'cardiovascular_1': { min: 0, max: 200, unit: 'mg/dL', name: 'Total Cholesterol' }, // Total Cholesterol
  'cardiovascular_2': { min: 0, max: 100, unit: 'mg/dL', name: 'LDL Cholesterol' }, // LDL
  'cardiovascular_3': { min: 40, max: 100, unit: 'mg/dL', name: 'HDL Cholesterol' }, // HDL - FIXED RANGE
  'cardiovascular_4': { min: 0, max: 150, unit: 'mg/dL', name: 'Triglycerides' },
  'cardiovascular_5': { min: 0, max: 130, unit: 'mg/dL', name: 'Non-HDL Cholesterol' }, // Non-HDL
  'cardiovascular_11': { min: 0, max: 100, unit: 'mg/dL', name: 'Apolipoprotein B' }, // ApoB
  'cardiovascular_12': { min: 1000, max: 1500, unit: 'nmol/L', name: 'LDL Particle Number' },
  'cardiovascular_13': { min: 20.5, max: 21.2, unit: 'nm', name: 'LDL Particle Size' }, // Fixed from null
  'cardiovascular_14': { min: 0, max: 500, unit: 'nmol/L', name: 'Small LDL-P' }, // Fixed from null
  'cardiovascular_15': { min: 0, max: 500, unit: 'nmol/L', name: 'Medium LDL-P' }, // Fixed from null
};

/**
 * Get reference range for a metric
 */
function getReferenceRange(metricId, userProfile = {}) {
  try {
    // Get default range
    let range = DEFAULT_RANGES[metricId];

    if (!range) {
      console.warn(`[RefRange] No default range found for ${metricId}`);
      return null;
    }

    // Clone to avoid modifying default
    range = { ...range };

    // Adjust based on user profile
    range = adjustForProfile(metricId, range, userProfile);

    return range;

  } catch (error) {
    console.error('[RefRange] Get reference range error:', error);
    return null;
  }
}

/**
 * Adjust range based on user profile (age, sex, conditions)
 */
function adjustForProfile(metricId, range, profile) {
  // HDL adjustments by sex
  if (metricId === 'cardiovascular_3') { // HDL
    if (profile.sex === 'Male') {
      range.min = 40;
      range.max = 60;
    } else if (profile.sex === 'Female') {
      range.min = 50;
      range.max = 60;
    }
  }

  // LDL adjustments for cardiovascular disease
  if (metricId === 'cardiovascular_2') { // LDL
    if (profile.hasCardiovascularDisease) {
      range.max = 70; // Stricter for CVD patients
    }
  }

  // Triglycerides adjustments
  if (metricId === 'cardiovascular_4') { // Triglycerides
    // Standard range is 0-150 mg/dL
    // No adjustment needed for most cases
  }

  // Age-based adjustments for certain metrics
  const age = calculateAge(profile.dateOfBirth);
  
  if (age && age > 60) {
    // Slightly different ranges for elderly
    if (metricId === 'cardiovascular_1') { // Total Cholesterol
      range.max = 240; // More lenient for elderly
    }
  }

  return range;
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dob) {
  if (!dob) return null;
  
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Check if value is within reference range
 */
function isWithinRange(value, metricId, userProfile = {}) {
  try {
    const range = getReferenceRange(metricId, userProfile);
    
    if (!range) {
      return null; // Unknown
    }

    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) {
      return null;
    }

    return numValue >= range.min && numValue <= range.max;

  } catch (error) {
    console.error('[RefRange] Is within range error:', error);
    return null;
  }
}

/**
 * Get range status for a value
 */
function getRangeStatus(value, metricId, userProfile = {}) {
  try {
    const range = getReferenceRange(metricId, userProfile);
    
    if (!range) {
      return 'unknown';
    }

    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) {
      return 'unknown';
    }

    if (numValue < range.min) {
      return 'low';
    } else if (numValue > range.max) {
      return 'high';
    } else {
      return 'normal';
    }

  } catch (error) {
    console.error('[RefRange] Get range status error:', error);
    return 'unknown';
  }
}

/**
 * Get custom reference range for user (from custom_reference_ranges table)
 */
async function getCustomRange(db, userId, metricName) {
  try {
    const result = await db.query(`
      SELECT *
      FROM custom_reference_ranges
      WHERE user_id = $1 
        AND metric_name = $2
        AND is_active = true
        AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, metricName]);

    if (result.rows.length === 0) {
      return null;
    }

    const custom = result.rows[0];

    return {
      min: parseFloat(custom.min_value),
      max: parseFloat(custom.max_value),
      unit: custom.units,
      source: 'custom',
      condition: custom.medical_condition,
      notes: custom.notes
    };

  } catch (error) {
    console.error('[RefRange] Get custom range error:', error);
    return null;
  }
}

/**
 * Get all ranges for a system
 */
function getSystemRanges(systemId, userProfile = {}) {
  try {
    const systemRanges = [];

    for (const [metricId, range] of Object.entries(DEFAULT_RANGES)) {
      if (metricId.startsWith(`system_${systemId}_`)) {
        systemRanges.push({
          metricId: metricId,
          ...getReferenceRange(metricId, userProfile)
        });
      }
    }

    return systemRanges;

  } catch (error) {
    console.error('[RefRange] Get system ranges error:', error);
    return [];
  }
}

/**
 * Format range for display
 */
function formatRange(range) {
  if (!range) {
    return 'N/A';
  }

  return `${range.min}-${range.max} ${range.unit || ''}`;
}

/**
 * Load ranges from database
 */
async function loadFromDatabase(db) {
  try {
    const result = await db.query(`
      SELECT 
        metric_id,
        metric_name,
        normal_min,
        normal_max,
        canonical_unit
      FROM master_metrics
      WHERE normal_min IS NOT NULL AND normal_max IS NOT NULL
    `);

    console.log(`[RefRange] Loaded ${result.rows.length} reference ranges from database`);

    // Update DEFAULT_RANGES with database values
    for (const row of result.rows) {
      DEFAULT_RANGES[row.metric_id] = {
        min: parseFloat(row.normal_min),
        max: parseFloat(row.normal_max),
        unit: row.canonical_unit,
        name: row.metric_name
      };
    }

    return result.rows.length;

  } catch (error) {
    console.error('[RefRange] Load from database error:', error);
    throw error;
  }
}

module.exports = {
  getReferenceRange,
  isWithinRange,
  getRangeStatus,
  getCustomRange,
  getSystemRanges,
  formatRange,
  loadFromDatabase
};
