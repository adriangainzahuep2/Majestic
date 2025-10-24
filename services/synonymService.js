const fs = require('fs').promises;
const path = require('path');

let synonymsCache = null;
let lastLoadTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Synonym Service
 * Handles metric name matching and synonym management
 * Fixes: Auto-mapping at 95% confidence threshold
 */

/**
 * Load synonyms from JSON file
 */
async function loadSynonyms() {
  try {
    // Check cache
    if (synonymsCache && lastLoadTime && (Date.now() - lastLoadTime < CACHE_DURATION)) {
      return synonymsCache;
    }

    const synonymsPath = path.join(__dirname, '../public/data/metric-synonyms.json');
    
    try {
      const data = await fs.readFile(synonymsPath, 'utf8');
      synonymsCache = JSON.parse(data);
      lastLoadTime = Date.now();
      console.log(`[Synonyms] Loaded ${synonymsCache.length} synonyms from file`);
      return synonymsCache;
    } catch (fileError) {
      console.warn('[Synonyms] File not found, returning empty array');
      synonymsCache = [];
      return synonymsCache;
    }

  } catch (error) {
    console.error('[Synonyms] Load error:', error);
    return [];
  }
}

/**
 * Find best match for a metric name
 * Returns match with confidence score
 */
async function findBestMatch(metricName) {
  try {
    const synonyms = await loadSynonyms();
    
    if (!synonyms || synonyms.length === 0) {
      return null;
    }

    const normalized = normalizeString(metricName);
    let bestMatch = null;
    let highestScore = 0;

    for (const synonym of synonyms) {
      const synNormalized = normalizeString(synonym.synonym_name);
      const score = calculateSimilarity(normalized, synNormalized);

      if (score > highestScore) {
        highestScore = score;
        bestMatch = {
          synonym_id: synonym.synonym_id,
          metric_id: synonym.metric_id,
          canonical_name: synonym.canonical_name,
          system_id: synonym.system_id,
          canonical_unit: synonym.canonical_unit,
          confidence: score,
          reason: score === 1.0 ? 'Exact match' : 'Fuzzy match'
        };
      }

      // Early exit for exact match
      if (score === 1.0) {
        break;
      }
    }

    return bestMatch;

  } catch (error) {
    console.error('[Synonyms] Find best match error:', error);
    return null;
  }
}

/**
 * Calculate similarity between two strings
 * Returns score between 0 and 1
 */
function calculateSimilarity(str1, str2) {
  // Exact match
  if (str1 === str2) {
    return 1.0;
  }

  // Contains match
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.95;
  }

  // Levenshtein distance for fuzzy matching
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  const similarity = 1 - (distance / maxLength);

  return similarity;
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Normalize string for comparison
 */
function normalizeString(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '') // Remove special characters
    .replace(/\s+/g, ''); // Remove whitespace
}

/**
 * Add user-defined synonym
 */
async function addUserSynonym(userId, synonymName, canonicalName, metricId) {
  try {
    // This would typically save to database
    // For now, we'll just log it
    console.log(`[Synonyms] User ${userId} added synonym: ${synonymName} → ${canonicalName}`);
    
    // In production, you would:
    // 1. Save to database
    // 2. Regenerate JSON file
    // 3. Clear cache

    return {
      success: true,
      synonym: {
        synonymName,
        canonicalName,
        metricId
      }
    };

  } catch (error) {
    console.error('[Synonyms] Add user synonym error:', error);
    throw error;
  }
}

/**
 * Get all synonyms for a metric
 */
async function getSynonymsForMetric(metricId) {
  try {
    const synonyms = await loadSynonyms();
    
    return synonyms.filter(s => s.metric_id === metricId);

  } catch (error) {
    console.error('[Synonyms] Get synonyms for metric error:', error);
    return [];
  }
}

/**
 * Reload synonyms from database (admin function)
 */
async function reloadFromDatabase(db) {
  try {
    const result = await db.query(`
      SELECT 
        ms.synonym_id,
        ms.metric_id,
        ms.synonym_name,
        mm.metric_name as canonical_name,
        mm.system_id,
        mm.canonical_unit
      FROM master_metric_synonyms ms
      JOIN master_metrics mm ON ms.metric_id = mm.metric_id
      ORDER BY ms.synonym_id
    `);

    // Save to JSON file
    const synonymsPath = path.join(__dirname, '../public/data/metric-synonyms.json');
    await fs.writeFile(synonymsPath, JSON.stringify(result.rows, null, 2));

    // Clear cache to force reload
    synonymsCache = null;
    lastLoadTime = null;

    console.log(`[Synonyms] Reloaded ${result.rows.length} synonyms from database`);

    return result.rows.length;

  } catch (error) {
    console.error('[Synonyms] Reload from database error:', error);
    throw error;
  }
}

module.exports = {
  loadSynonyms,
  findBestMatch,
  addUserSynonym,
  getSynonymsForMetric,
  reloadFromDatabase
};
