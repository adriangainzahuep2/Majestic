'use strict';

// Merge public/data/metrics.json and public/data/metric-synonyms.json
// into public/data/metrics.catalog.json without losing information.

const fs = require('fs');
const path = require('path');

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean).map(String)));
}

function main() {
  const publicDir = path.join(__dirname, '../public/data');
  const metricsPath = path.join(publicDir, 'metrics.json');
  const synonymsPath = path.join(publicDir, 'metric-synonyms.json');
  const outPath = path.join(publicDir, 'metrics.catalog.json');

  const metrics = readJson(metricsPath) || [];
  const synonymsData = readJson(synonymsPath) || { synonyms: {}, units_synonyms: {} };
  const synonymsMap = synonymsData.synonyms || {};
  const unitsSynonyms = synonymsData.units_synonyms || {};

  const merged = [];

  for (const entry of metrics) {
    if (!entry) continue;
    const metricName = (entry.metric || entry.metric_name || '').trim();
    if (!metricName) continue;

    const record = {
      metric: metricName,
      system: entry.system || entry.system_name || null,
      units: entry.units || entry.unit || null,
      normalRangeMin: entry.normalRangeMin ?? entry.min ?? null,
      normalRangeMax: entry.normalRangeMax ?? entry.max ?? null
    };

    // Attach synonyms if available for this canonical name
    const syns = synonymsMap[metricName];
    if (Array.isArray(syns) && syns.length > 0) {
      record.synonyms = uniq(syns);
    }

    merged.push(record);
  }

  const output = {
    generated_at: new Date().toISOString(),
    metrics: merged,
    units_synonyms: unitsSynonyms
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`✅ Wrote unified catalog: ${outPath}`);
  console.log(`   metrics: ${merged.length}, units_synonyms: ${Object.keys(unitsSynonyms).length}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('❌ Merge failed:', err.message);
    process.exit(1);
  }
}


