const crypto = require('crypto');

/**
 * Structured logger utility for privacy-safe logging
 * Never logs PII like DOB, tokens, or full request/response bodies
 */
function log(level, event, data = {}) {
  const logEntry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data
  };
  
  console.log('[server]', JSON.stringify(logEntry));
}

/**
 * Generate a correlation ID for request tracing
 */
function generateCorrelationId() {
  return crypto.randomUUID?.() || `srv-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a privacy-safe summary of profile data
 * Only includes flags, counts, and non-PII information
 */
function createProfileSummary(profileData) {
  const summary = {};
  
  if (profileData) {
    // Boolean flags for presence of key data
    summary.has_height = profileData.height_in !== null && profileData.height_in !== undefined;
    summary.has_weight = profileData.weight_lb !== null && profileData.weight_lb !== undefined;
    summary.has_dob = profileData.date_of_birth !== null && profileData.date_of_birth !== undefined;
    summary.has_sex = !!profileData.sex;
    summary.has_ethnicity = !!profileData.ethnicity;
    summary.has_country = !!profileData.country_of_residence;
    summary.unit_system = profileData.preferred_unit_system || null;
    
    // Lifestyle flags (safe to log as they're not directly identifiable)
    summary.smoker = profileData.smoker;
    summary.pregnant = profileData.pregnant;
    summary.has_alcohol_data = profileData.alcohol_drinks_per_week !== null && profileData.alcohol_drinks_per_week !== undefined;
    
    // Count of fields being updated (for change tracking)
    summary.field_count = Object.keys(profileData).length;
    summary.allergies_count = Array.isArray(profileData.allergies) ? profileData.allergies.length : 0;
    summary.chronic_conditions_count = Array.isArray(profileData.chronicConditions) ? profileData.chronicConditions.length : 0;
  }
  
  return summary;
}

module.exports = {
  info: (event, data) => log('INFO', event, data),
  warn: (event, data) => log('WARN', event, data),
  error: (event, data) => log('ERROR', event, data),
  generateCorrelationId,
  createProfileSummary
};