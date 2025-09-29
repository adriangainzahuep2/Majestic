#!/usr/bin/env node
/**
 * Generate a synthetic master template XLSX with many metric rows.
 *
 * Usage examples:
 *   node scripts/generate_synthetic_master.js --input ./public/data/master_template.xlsx --output ./data/master_versions/master_synthetic.xlsx --count 1000
 *   node scripts/generate_synthetic_master.js --count 2000  (uses current template if available)
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.split('=');
      const key = k.replace(/^--/, '');
      if (v !== undefined) args[key] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
      else args[key] = true;
    }
  }
  return args;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function readWorkbook(inputPath) {
  if (!inputPath) {
    const fallback = path.join(__dirname, '../public/data/master_template.xlsx');
    if (fs.existsSync(fallback)) return XLSX.readFile(fallback);
    throw new Error('No --input provided and fallback template not found at public/data/master_template.xlsx');
  }
  if (!fs.existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);
  return XLSX.readFile(inputPath);
}

function sheetToJsonSafe(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function varyNumber(base, amount = 0.2) {
  if (base == null || isNaN(Number(base))) return null;
  const factor = 1 + (Math.random() * 2 - 1) * amount; // ±amount
  const v = Number(base) * factor;
  return Number(v.toFixed(3));
}

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildSyntheticRows(metricsRows, convRows, targetCount) {
  const output = [];
  const existingIds = new Set(metricsRows.map(r => String(r.metric_id)));

  // Prepare unit variations from conversion groups
  const convByGroup = new Map();
  for (const r of convRows || []) {
    if (!r.conversion_group_id) continue;
    const key = String(r.conversion_group_id);
    if (!convByGroup.has(key)) convByGroup.set(key, new Set());
    if (r.canonical_unit) convByGroup.get(key).add(String(r.canonical_unit));
    if (r.alt_unit) convByGroup.get(key).add(String(r.alt_unit));
  }

  // If there are no conversion groups, allow using original unit only
  const metricsPool = metricsRows.length > 0 ? metricsRows : [];
  if (metricsPool.length === 0) throw new Error('Template has no metrics rows to sample from');

  // We will keep all original rows and add synthetic until reaching targetCount
  for (const r of metricsRows) output.push({ ...r });

  let seq = 1;
  while (output.length < targetCount) {
    const base = pickRandom(metricsPool);
    const cloned = { ...base };

    // Unique metric_id
    let newId;
    const baseId = sanitizeId(cloned.metric_id || `metric_${Date.now()}`);
    do {
      newId = `${baseId}_synth_${seq++}`;
    } while (existingIds.has(newId));
    existingIds.add(newId);
    cloned.metric_id = newId;

    // Slightly vary metric_name
    const suffix = ['Variant A', 'Variant B', 'Alt', 'v2', 'Pilot', 'Proto'];
    cloned.metric_name = `${cloned.metric_name} ${pickRandom(suffix)} ${Math.floor(Math.random() * 100)}`.trim();

    // Ensure system_id is integer in [1..13]
    let sys = Number(cloned.system_id);
    if (!Number.isInteger(sys) || sys < 1 || sys > 13) sys = Math.floor(Math.random() * 13) + 1;
    cloned.system_id = sys;

    // Units variation from conversion group
    const groupId = cloned.conversion_group_id ? String(cloned.conversion_group_id) : null;
    const unitSet = groupId && convByGroup.has(groupId) ? Array.from(convByGroup.get(groupId)) : null;
    if (unitSet && unitSet.length > 0) {
      cloned.canonical_unit = pickRandom(unitSet);
    }

    // Range variation (keep min < max)
    const minBase = Number(cloned.normal_min);
    const maxBase = Number(cloned.normal_max);
    let newMin = varyNumber(minBase, 0.25);
    let newMax = varyNumber(maxBase, 0.25);
    if (newMin == null || newMax == null || isNaN(newMin) || isNaN(newMax)) {
      // Fallback: generate a plausible range
      newMin = Number((Math.random() * 10).toFixed(3));
      newMax = Number((newMin + Math.random() * 20 + 1).toFixed(3));
    }
    if (newMax <= newMin) newMax = Number((newMin + Math.abs(newMax - newMin) + 1).toFixed(3));
    cloned.normal_min = newMin;
    cloned.normal_max = newMax;

    // Key metric flag randomized
    cloned.is_key_metric = Math.random() < 0.2 ? 'Y' : 'N';

    // Source/explanation tweaks
    cloned.source = cloned.source ? `${cloned.source} (synthetic)` : 'Synthetic Generator';
    cloned.explanation = cloned.explanation ? `${cloned.explanation} (stress test row)` : 'Stress test synthetic metric for validation.';

    output.push(cloned);
  }

  return output;
}

function writeWorkbook(metricsRows, synRows, convRows, outPath) {
  const wb = XLSX.utils.book_new();
  const metricsHeaders = ['metric_id', 'metric_name', 'system_id', 'canonical_unit', 'conversion_group_id', 'normal_min', 'normal_max', 'is_key_metric', 'source', 'explanation'];
  const toAoA = (rows, headers) => [headers].concat(rows.map(r => headers.map(h => r[h] ?? '')));

  const metricsWS = XLSX.utils.aoa_to_sheet(toAoA(metricsRows, metricsHeaders));
  XLSX.utils.book_append_sheet(wb, metricsWS, 'metrics');

  if (synRows && synRows.length) {
    const synHeaders = ['synonym_id', 'metric_id', 'synonym_name', 'notes'];
    const synWS = XLSX.utils.aoa_to_sheet(toAoA(synRows, synHeaders));
    XLSX.utils.book_append_sheet(wb, synWS, 'synonyms');
  } else {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['synonym_id', 'metric_id', 'synonym_name', 'notes']]), 'synonyms');
  }

  if (convRows && convRows.length) {
    const convHeaders = ['conversion_group_id', 'canonical_unit', 'alt_unit', 'to_canonical_formula', 'from_canonical_formula', 'notes'];
    const convWS = XLSX.utils.aoa_to_sheet(toAoA(convRows, convHeaders));
    XLSX.utils.book_append_sheet(wb, convWS, 'conversion_groups');
  } else {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['conversion_group_id', 'canonical_unit', 'alt_unit', 'to_canonical_formula', 'from_canonical_formula', 'notes']]), 'conversion_groups');
  }

  ensureDir(outPath);
  XLSX.writeFile(wb, outPath);
}

(function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.input || args.i;
  const desiredCount = Number(args.count || args.n || 1000);
  const defaultOut = path.join(__dirname, `../data/master_versions/master_synthetic_${Date.now()}.xlsx`);
  const outputPath = args.output || args.o || defaultOut;

  const wb = readWorkbook(inputPath);
  const metricsRows = sheetToJsonSafe(wb, 'metrics');
  const synRows = sheetToJsonSafe(wb, 'synonyms');
  const convRows = sheetToJsonSafe(wb, 'conversion_groups');

  if (!metricsRows || metricsRows.length === 0) {
    throw new Error('Template has empty metrics sheet. Provide a valid master template.');
  }

  const syntheticMetrics = buildSyntheticRows(metricsRows, convRows, desiredCount);
  writeWorkbook(syntheticMetrics, synRows, convRows, outputPath);

  console.log(`✅ Generated synthetic workbook at: ${outputPath}`);
  console.log(`📈 Metrics rows: ${syntheticMetrics.length}`);
})();


