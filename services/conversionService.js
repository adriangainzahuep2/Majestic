const fs = require('fs').promises;
const path = require('path');

let conversionsCache = null;

/**
 * Conversion Service
 * Handles unit conversions for lab metrics
 */

/**
 * Load conversion groups from JSON
 */
async function loadConversions() {
  try {
    if (conversionsCache) {
      return conversionsCache;
    }

    const conversionsPath = path.join(__dirname, '../public/data/conversion-groups.json');
    
    try {
      const data = await fs.readFile(conversionsPath, 'utf8');
      conversionsCache = JSON.parse(data);
      console.log(`[Conversions] Loaded ${conversionsCache.length} conversion rules`);
      return conversionsCache;
    } catch (fileError) {
      console.warn('[Conversions] File not found, returning empty array');
      conversionsCache = [];
      return conversionsCache;
    }

  } catch (error) {
    console.error('[Conversions] Load error:', error);
    return [];
  }
}

/**
 * Convert value between units
 */
async function convertValue(value, fromUnit, toUnit, conversionGroupId) {
  try {
    if (fromUnit === toUnit) {
      return value;
    }

    const conversions = await loadConversions();
    
    // Find conversion rules for this group
    const groupConversions = conversions.filter(c => c.conversion_group_id === conversionGroupId);

    if (groupConversions.length === 0) {
      console.warn(`[Conversions] No conversion group found for ${conversionGroupId}`);
      return value;
    }

    // Find canonical unit for this group
    const canonicalUnit = groupConversions[0].canonical_unit;

    let result = value;

    // Convert from source unit to canonical unit
    if (fromUnit !== canonicalUnit) {
      const toCanonicalRule = groupConversions.find(c => c.alt_unit === fromUnit);
      
      if (toCanonicalRule && toCanonicalRule.to_canonical_formula) {
        result = evaluateFormula(toCanonicalRule.to_canonical_formula, result);
      }
    }

    // Convert from canonical unit to target unit
    if (toUnit !== canonicalUnit) {
      const fromCanonicalRule = groupConversions.find(c => c.alt_unit === toUnit);
      
      if (fromCanonicalRule && fromCanonicalRule.from_canonical_formula) {
        result = evaluateFormula(fromCanonicalRule.from_canonical_formula, result);
      }
    }

    return result;

  } catch (error) {
    console.error('[Conversions] Convert value error:', error);
    return value; // Return original value if conversion fails
  }
}

/**
 * Evaluate conversion formula
 * Supports: x * factor, x / factor, x + offset, x - offset
 */
function evaluateFormula(formula, value) {
  try {
    // Replace 'x' with the actual value
    const expression = formula.replace(/x/g, value.toString());

    // Simple eval (in production, use a safer math parser)
    const result = eval(expression);

    return result;

  } catch (error) {
    console.error('[Conversions] Formula evaluation error:', error);
    return value;
  }
}

/**
 * Get available units for a conversion group
 */
async function getAvailableUnits(conversionGroupId) {
  try {
    const conversions = await loadConversions();
    
    const groupConversions = conversions.filter(c => c.conversion_group_id === conversionGroupId);

    if (groupConversions.length === 0) {
      return [];
    }

    const canonicalUnit = groupConversions[0].canonical_unit;
    const altUnits = groupConversions.map(c => c.alt_unit);

    return [canonicalUnit, ...altUnits];

  } catch (error) {
    console.error('[Conversions] Get available units error:', error);
    return [];
  }
}

/**
 * Check if conversion is available
 */
async function canConvert(fromUnit, toUnit, conversionGroupId) {
  try {
    const availableUnits = await getAvailableUnits(conversionGroupId);
    
    return availableUnits.includes(fromUnit) && availableUnits.includes(toUnit);

  } catch (error) {
    console.error('[Conversions] Can convert check error:', error);
    return false;
  }
}

/**
 * Batch convert multiple values
 */
async function convertBatch(values, fromUnit, toUnit, conversionGroupId) {
  try {
    const results = [];

    for (const value of values) {
      const converted = await convertValue(value, fromUnit, toUnit, conversionGroupId);
      results.push(converted);
    }

    return results;

  } catch (error) {
    console.error('[Conversions] Batch convert error:', error);
    return values; // Return original values if batch conversion fails
  }
}

/**
 * Get conversion factor (for display purposes)
 */
async function getConversionFactor(fromUnit, toUnit, conversionGroupId) {
  try {
    // Convert 1.0 to see the factor
    const factor = await convertValue(1.0, fromUnit, toUnit, conversionGroupId);
    
    return factor;

  } catch (error) {
    console.error('[Conversions] Get conversion factor error:', error);
    return 1.0;
  }
}

/**
 * Reload conversions from database
 */
async function reloadFromDatabase(db) {
  try {
    const result = await db.query(`
      SELECT *
      FROM master_conversion_groups
      ORDER BY conversion_group_id, alt_unit
    `);

    // Save to JSON file
    const conversionsPath = path.join(__dirname, '../public/data/conversion-groups.json');
    await fs.writeFile(conversionsPath, JSON.stringify(result.rows, null, 2));

    // Clear cache
    conversionsCache = null;

    console.log(`[Conversions] Reloaded ${result.rows.length} conversion rules from database`);

    return result.rows.length;

  } catch (error) {
    console.error('[Conversions] Reload from database error:', error);
    throw error;
  }
}

module.exports = {
  loadConversions,
  convertValue,
  getAvailableUnits,
  canConvert,
  convertBatch,
  getConversionFactor,
  reloadFromDatabase
};
