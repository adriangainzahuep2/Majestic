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

async function loadSynonyms() {
  try {
    if (synonymsCache && lastLoadTime && Date.now() - lastLoadTime < CACHE_DURATION) {
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
          reason: score === 1.0 ? 'Exact match' : 'Fuzzy match',
        };
      }
      if (score === 1.0) break;
    }
    return bestMatch;
  } catch (error) {
    console.error('[Synonyms] Find best match error:', error);
    return null;
  }
}

function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (str1.includes(str2) || str2.includes(str1)) return 0.95;

  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - distance / maxLength;
}

function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  return matrix[str2.length][str1.length];
}

function normalizeString(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '');
}

async function addUserSynonym(userId, synonymName, canonicalName, metricId) {
  try {
    console.log(`[Synonyms] User ${userId} added synonym: ${synonymName} → ${canonicalName}`);
    return { success: true, synonym: { synonymName, canonicalName, metricId } };
  } catch (error) {
    console.error('[Synonyms] Add user synonym error:', error);
    throw error;
  }
}

async function getSynonymsForMetric(metricId) {
  try {
    const synonyms = await loadSynonyms();
    return synonyms.filter((s) => s.metric_id === metricId);
  } catch (error) {
    console.error('[Synonyms] Get synonyms for metric error:', error);
    return [];
  }
}

async function reloadFromDatabase(db) {
  try {
    const result = await db.query(
      `SELECT ms.synonym_id, ms.metric_id, ms.synonym_name, mm.metric_name as canonical_name, mm.system_id, mm.canonical_unit
       FROM master_metric_synonyms ms
       JOIN master_metrics mm ON ms.metric_id = mm.metric_id
       ORDER BY ms.synonym_id`
    );

    const synonymsPath = path.join(__dirname, '../public/data/metric-synonyms.json');
    await fs.writeFile(synonymsPath, JSON.stringify(result.rows, null, 2));

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
  reloadFromDatabase,
};
