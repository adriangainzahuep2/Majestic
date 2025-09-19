'use strict';

/**
 * Unified Metrics Catalog
 *
 * Loads official metrics (name, system, units, ranges) and synonym tables,
 * provides helpers to normalize names, look up ranges, and list metrics.
 */

const fs = require('fs');
const path = require('path');

let catalogState = null;

function safeReadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.warn(`[metricsCatalog] Failed to read ${filePath}:`, error.message);
  }
  return null;
}

function loadCatalog() {
  if (catalogState) return catalogState;

  // Primary locations
  const publicDir = path.join(__dirname, '../public/data');
  const unifiedPublicPath = path.join(publicDir, 'metrics.catalog.json');
  const metricsPublicPath = path.join(publicDir, 'metrics.json');
  const synonymsPublicPath = path.join(publicDir, 'metric-synonyms.json');

  // Legacy/UI location (fallback)
  const srcDir = path.join(__dirname, '../src/data');
  const metricsSrcPath = path.join(srcDir, 'metrics.json');

  // Prefer unified catalog if available
  const unifiedData = safeReadJson(unifiedPublicPath);
  let metricsData;
  let synonymsData;

  if (unifiedData && Array.isArray(unifiedData.metrics)) {
    metricsData = unifiedData.metrics;
    synonymsData = { 
      synonyms: {}, 
      units_synonyms: unifiedData.units_synonyms || {} 
    };
  } else {
    metricsData = safeReadJson(metricsPublicPath) || safeReadJson(metricsSrcPath) || [];
    synonymsData = safeReadJson(synonymsPublicPath) || { synonyms: {}, units_synonyms: {} };
  }

  // Build maps
  const metricsByName = new Map(); // lowerName -> metricObj
  const canonicalNames = new Set();

  for (const entry of metricsData) {
    if (!entry || (!entry.metric && !entry.metric_name)) continue;
    const name = (entry.metric || entry.metric_name).trim();
    const record = {
      metric: name,
      system: entry.system || entry.system_name || null,
      units: entry.units || entry.unit || null,
      normalRangeMin: entry.normalRangeMin ?? entry.min ?? null,
      normalRangeMax: entry.normalRangeMax ?? entry.max ?? null
    };
    metricsByName.set(name.toLowerCase(), record);
    canonicalNames.add(name);
  }

  // Build reverse synonyms index: synonym(lower) -> canonical
  const reverseSynonyms = new Map();
  const synonyms = { ...(synonymsData.synonyms || {}) };

  // If unified provided per-metric synonyms, fold them into the synonyms map
  for (const entry of metricsData) {
    const metricName = (entry.metric || entry.metric_name || '').trim();
    if (!metricName) continue;
    if (Array.isArray(entry.synonyms) && entry.synonyms.length > 0) {
      const arr = Array.from(new Set(entry.synonyms.map(s => String(s))));
      synonyms[metricName] = (synonyms[metricName] || []).concat(arr)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
    }
  }

  // Build reverse map
  for (const [canonical, list] of Object.entries(synonyms)) {
    if (Array.isArray(list)) {
      for (const syn of list) {
        reverseSynonyms.set(String(syn).toLowerCase(), canonical);
      }
    }
    reverseSynonyms.set(String(canonical).toLowerCase(), canonical);
  }

  catalogState = {
    metricsByName,
    synonyms,
    unitsSynonyms: synonymsData.units_synonyms || {},
    reverseSynonyms
  };
  return catalogState;
}

function normalizeName(inputName) {
  if (!inputName) return inputName;
  const { metricsByName, reverseSynonyms } = loadCatalog();
  const lower = String(inputName).trim().toLowerCase();

  // 1) Exact/identity in metrics catalog
  if (metricsByName.has(lower)) {
    return metricsByName.get(lower).metric;
  }

  // 2) Synonym lookup
  const canonical = reverseSynonyms.get(lower);
  if (canonical) return canonical;

  return inputName; // fallback
}

function findMetricByName(name) {
  if (!name) return null;
  const { metricsByName } = loadCatalog();
  const lower = String(name).trim().toLowerCase();

  if (metricsByName.has(lower)) {
    return metricsByName.get(lower);
  }

  const normalized = normalizeName(name);
  const lowerNorm = String(normalized).toLowerCase();
  return metricsByName.get(lowerNorm) || null;
}

function getRangeForName(name) {
  const m = findMetricByName(name);
  if (!m) return null;
  return {
    min: m.normalRangeMin,
    max: m.normalRangeMax,
    units: m.units
  };
}

function getAllMetrics() {
  const { metricsByName } = loadCatalog();
  return Array.from(metricsByName.values());
}

async function getOfficialNamesBySystem(systemName) {
  const { metricsByName } = loadCatalog();
  const target = String(systemName || '').toLowerCase();
  return Array.from(metricsByName.values())
    .filter(m => (m.system || '').toLowerCase() === target)
    .map(m => m.metric);
}

module.exports = {
  loadCatalog,
  normalizeName,
  findMetricByName,
  getRangeForName,
  getAllMetrics,
  getOfficialNamesBySystem
};


