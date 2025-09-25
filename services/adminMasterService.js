const XLSX = require('xlsx');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../database/schema');

function computeHash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

class AdminMasterService {
  /**
   * Parse an uploaded XLSX buffer into structured data
   */
  parseWorkbook(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });

    const metricsSheet = XLSX.utils.sheet_to_json(wb.Sheets['metrics'] || {}, { defval: null });
    const synonymsSheet = XLSX.utils.sheet_to_json(wb.Sheets['synonyms'] || {}, { defval: null });
    const convSheet = XLSX.utils.sheet_to_json(wb.Sheets['conversion_groups'] || {}, { defval: null });

    return { metricsSheet, synonymsSheet, convSheet };
  }

  /**
   * Validate required columns and simple types
   */
  validate({ metricsSheet, synonymsSheet, convSheet }) {
    const errors = [];

    // Required columns for metrics sheet
    const reqMetrics = ['metric_id', 'metric_name', 'system_id', 'canonical_unit', 'conversion_group_id', 'normal_min', 'normal_max', 'is_key_metric', 'source', 'explanation'];
    if (!metricsSheet || metricsSheet.length === 0) errors.push('metrics sheet is empty');
    else {
      const cols = Object.keys(metricsSheet[0] || {});
      for (const c of reqMetrics) if (!cols.includes(c)) errors.push(`metrics missing column: ${c}`);
    }

    // Required columns for synonyms sheet
    const reqSyn = ['synonym_id', 'metric_id', 'synonym_name', 'notes'];
    if (synonymsSheet && synonymsSheet.length > 0) {
      const cols = Object.keys(synonymsSheet[0] || {});
      for (const c of reqSyn) if (!cols.includes(c)) errors.push(`synonyms missing column: ${c}`);
    }

    // Required columns for conversion_groups sheet
    const reqConv = ['conversion_group_id', 'canonical_unit', 'alt_unit', 'to_canonical_formula', 'from_canonical_formula', 'notes'];
    if (convSheet && convSheet.length > 0) {
      const cols = Object.keys(convSheet[0] || {});
      for (const c of reqConv) if (!cols.includes(c)) errors.push(`conversion_groups missing column: ${c}`);
    }

    // Type checks and allowed values
    const allowedUnits = new Set();
    for (const row of convSheet || []) {
      if (row.canonical_unit) allowedUnits.add(String(row.canonical_unit));
      if (row.alt_unit) allowedUnits.add(String(row.alt_unit));
      if (row.to_canonical_formula && !String(row.to_canonical_formula).includes('x')) {
        errors.push(`conversion_groups: to_canonical_formula must reference 'x' for ${row.conversion_group_id}`);
      }
      if (row.from_canonical_formula && !String(row.from_canonical_formula).includes('x')) {
        errors.push(`conversion_groups: from_canonical_formula must reference 'x' for ${row.conversion_group_id}`);
      }
    }

    for (const row of metricsSheet || []) {
      if (row.system_id != null && !Number.isInteger(Number(row.system_id))) {
        errors.push(`metrics[${row.metric_id}]: system_id must be integer`);
      }
      if (row.normal_min != null && isNaN(Number(row.normal_min))) {
        errors.push(`metrics[${row.metric_id}]: normal_min must be numeric`);
      }
      if (row.normal_max != null && isNaN(Number(row.normal_max))) {
        errors.push(`metrics[${row.metric_id}]: normal_max must be numeric`);
      }
      if (row.is_key_metric != null) {
        const v = String(row.is_key_metric).trim().toUpperCase();
        if (v !== 'Y' && v !== 'N') errors.push(`metrics[${row.metric_id}]: is_key_metric must be Y or N`);
      }
      if (allowedUnits.size > 0 && row.canonical_unit && !allowedUnits.has(String(row.canonical_unit))) {
        errors.push(`metrics[${row.metric_id}]: canonical_unit not in conversion_groups units`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Compute diff against current DB (added/changed/removed counts)
   */
  async diff(parsed) {
    const client = await pool.connect();
    try {
      const dbMetrics = await client.query('SELECT * FROM master_metrics');
      const dbById = new Map(dbMetrics.rows.map(r => [r.metric_id, r]));

      let added = 0, changed = 0, removed = 0;

      const incomingIds = new Set();
      for (const row of parsed.metricsSheet) {
        incomingIds.add(String(row.metric_id));
        const existing = dbById.get(String(row.metric_id));
        if (!existing) {
          added++;
        } else {
          const shape = {
            metric_name: row.metric_name,
            system_id: row.system_id,
            canonical_unit: row.canonical_unit,
            conversion_group_id: row.conversion_group_id,
            normal_min: row.normal_min,
            normal_max: row.normal_max,
            is_key_metric: String(row.is_key_metric).toUpperCase() === 'Y',
            source: row.source,
            explanation: row.explanation
          };
          const existingShape = {
            metric_name: existing.metric_name,
            system_id: existing.system_id,
            canonical_unit: existing.canonical_unit,
            conversion_group_id: existing.conversion_group_id,
            normal_min: existing.normal_min,
            normal_max: existing.normal_max,
            is_key_metric: existing.is_key_metric,
            source: existing.source,
            explanation: existing.explanation
          };
          if (computeHash(shape) !== computeHash(existingShape)) changed++;
        }
      }
      for (const id of dbById.keys()) if (!incomingIds.has(String(id))) removed++;

      return { added, changed, removed };
    } finally {
      client.release();
    }
  }

  /**
   * Commit as new version (atomic, idempotent via hash)
   */
  async commit(buffer, changeSummary, createdBy) {
    const parsed = this.parseWorkbook(buffer);
    const { valid, errors } = this.validate(parsed);
    if (!valid) return { success: false, errors };

    const dataHash = computeHash(parsed);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotence check
      const existingVersion = await client.query('SELECT version_id FROM master_versions WHERE data_hash = $1', [dataHash]);
      if (existingVersion.rows.length > 0) {
        await client.query('ROLLBACK');
        return { success: true, version_id: existingVersion.rows[0].version_id, idempotent: true };
      }

      const { added, changed, removed } = await this.diff(parsed);

      // Write version row
      const ver = await client.query(`
        INSERT INTO master_versions (change_summary, created_by, data_hash, added_count, changed_count, removed_count)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING version_id
      `, [changeSummary || 'update', createdBy || 'admin', dataHash, added, changed, removed]);
      const versionId = ver.rows[0].version_id;

      // Persist original XLSX
      const versionsDir = path.join(__dirname, '../data/master_versions');
      if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true });
      const xlsxPath = path.join(versionsDir, `master_version_${versionId}.xlsx`);
      fs.writeFileSync(xlsxPath, buffer);
      await client.query('UPDATE master_versions SET xlsx_path = $1 WHERE version_id = $2', [xlsxPath, versionId]);

      // Snapshot JSONs
      await client.query(`
        INSERT INTO master_snapshots (version_id, metrics_json, synonyms_json, conversion_groups_json)
        VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb)
      `, [versionId, JSON.stringify(parsed.metricsSheet), JSON.stringify(parsed.synonymsSheet), JSON.stringify(parsed.convSheet)]);

      // Replace master tables (atomic)
      await client.query('DELETE FROM master_metric_synonyms');
      await client.query('DELETE FROM master_conversion_groups');
      await client.query('DELETE FROM master_metrics');

      for (const row of parsed.metricsSheet) {
        await client.query(`
          INSERT INTO master_metrics (
            metric_id, metric_name, system_id, canonical_unit, conversion_group_id, normal_min, normal_max, is_key_metric, source, explanation
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          String(row.metric_id), row.metric_name, row.system_id, row.canonical_unit, row.conversion_group_id,
          row.normal_min, row.normal_max, String(row.is_key_metric).toUpperCase() === 'Y', row.source, row.explanation
        ]);
      }

      for (const row of parsed.synonymsSheet || []) {
        await client.query(`
          INSERT INTO master_metric_synonyms (synonym_id, metric_id, synonym_name, notes)
          VALUES ($1,$2,$3,$4)
        `, [row.synonym_id, String(row.metric_id), row.synonym_name, row.notes || null]);
      }

      for (const row of parsed.convSheet || []) {
        await client.query(`
          INSERT INTO master_conversion_groups (
            conversion_group_id, canonical_unit, alt_unit, to_canonical_formula, from_canonical_formula, notes
          ) VALUES ($1,$2,$3,$4,$5,$6)
        `, [row.conversion_group_id, row.canonical_unit, row.alt_unit, row.to_canonical_formula, row.from_canonical_formula, row.notes || null]);
      }

      await client.query('COMMIT');

      // Auto-sync to JSON files after successful commit
      try {
        await this.syncToJSONFiles(versionId);
        console.log('[ADMIN] Successfully synced to JSON files');
      } catch (syncError) {
        console.warn('[ADMIN] Commit successful but JSON sync failed:', syncError.message);
        // Don't fail the commit if JSON sync fails
      }

      return { success: true, version_id: versionId, added, changed, removed };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async exportCurrentAsWorkbookBuffer() {
    const client = await pool.connect();
    try {
      const [mRes, sRes, cRes] = await Promise.all([
        client.query('SELECT metric_id, metric_name, system_id, canonical_unit, conversion_group_id, normal_min, normal_max, is_key_metric, source, explanation FROM master_metrics ORDER BY metric_id'),
        client.query('SELECT synonym_id, metric_id, synonym_name, notes FROM master_metric_synonyms ORDER BY id'),
        client.query('SELECT conversion_group_id, canonical_unit, alt_unit, to_canonical_formula, from_canonical_formula, notes FROM master_conversion_groups ORDER BY conversion_group_id')
      ]);

      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();

      const metricsHeaders = ['metric_id','metric_name','system_id','canonical_unit','conversion_group_id','normal_min','normal_max','is_key_metric','source','explanation'];
      const metricsRows = [metricsHeaders, ...mRes.rows.map(r => [
        r.metric_id, r.metric_name, r.system_id, r.canonical_unit, r.conversion_group_id,
        r.normal_min, r.normal_max, r.is_key_metric ? 'Y' : 'N', r.source, r.explanation
      ])];
      const metricsWS = XLSX.utils.aoa_to_sheet(metricsRows);

      const synHeaders = ['synonym_id','metric_id','synonym_name','notes'];
      const synRows = [synHeaders, ...sRes.rows.map(r => [r.synonym_id, r.metric_id, r.synonym_name, r.notes])];
      const synWS = XLSX.utils.aoa_to_sheet(synRows);

      const convHeaders = ['conversion_group_id','canonical_unit','alt_unit','to_canonical_formula','from_canonical_formula','notes'];
      const convRows = [convHeaders, ...cRes.rows.map(r => [r.conversion_group_id, r.canonical_unit, r.alt_unit, r.to_canonical_formula, r.from_canonical_formula, r.notes])];
      const convWS = XLSX.utils.aoa_to_sheet(convRows);

      XLSX.utils.book_append_sheet(wb, metricsWS, 'metrics');
      XLSX.utils.book_append_sheet(wb, synWS, 'synonyms');
      XLSX.utils.book_append_sheet(wb, convWS, 'conversion_groups');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return Buffer.from(buf);
    } finally {
      client.release();
    }
  }

  async versions() {
    const result = await pool.query('SELECT * FROM master_versions ORDER BY version_id DESC');
    return result.rows;
  }

  async rollback(versionId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const snap = await client.query('SELECT * FROM master_snapshots WHERE version_id = $1', [versionId]);
      if (snap.rows.length === 0) throw new Error('snapshot not found');
      const { metrics_json, synonyms_json, conversion_groups_json } = snap.rows[0];

      await client.query('DELETE FROM master_metric_synonyms');
      await client.query('DELETE FROM master_conversion_groups');
      await client.query('DELETE FROM master_metrics');

      for (const row of metrics_json || []) {
        await client.query(`
          INSERT INTO master_metrics (
            metric_id, metric_name, system_id, canonical_unit, conversion_group_id, normal_min, normal_max, is_key_metric, source, explanation
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          String(row.metric_id), row.metric_name, row.system_id, row.canonical_unit, row.conversion_group_id,
          row.normal_min, row.normal_max, String(row.is_key_metric).toUpperCase() === 'Y', row.source, row.explanation
        ]);
      }
      for (const row of synonyms_json || []) {
        await client.query(`
          INSERT INTO master_metric_synonyms (synonym_id, metric_id, synonym_name, notes)
          VALUES ($1,$2,$3,$4)
        `, [row.synonym_id, String(row.metric_id), row.synonym_name, row.notes || null]);
      }
      for (const row of conversion_groups_json || []) {
        await client.query(`
          INSERT INTO master_conversion_groups (
            conversion_group_id, canonical_unit, alt_unit, to_canonical_formula, from_canonical_formula, notes
          ) VALUES ($1,$2,$3,$4,$5,$6)
        `, [row.conversion_group_id, row.canonical_unit, row.alt_unit, row.to_canonical_formula, row.from_canonical_formula, row.notes || null]);
      }
      await client.query('COMMIT');
      return { success: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Sync current DB state to JSON files after successful commit
   */
  async syncToJSONFiles(versionId) {
    const fs = require('fs');
    const path = require('path');

    // Get current master data from DB
    const [metricsRes, synonymsRes, convRes] = await Promise.all([
      pool.query('SELECT * FROM master_metrics ORDER BY metric_id'),
      pool.query('SELECT * FROM master_metric_synonyms ORDER BY metric_id, synonym_name'),
      pool.query('SELECT * FROM master_conversion_groups ORDER BY canonical_unit, alt_unit')
    ]);

    const metrics = metricsRes.rows;
    const synonyms = synonymsRes.rows;
    const conversions = convRes.rows;

    // Create metrics catalog structure
    const metricsCatalog = {
      generated_at: new Date().toISOString(),
      metrics: [],
      units_synonyms: {}
    };

    // System name mapping
    const systemNames = {
      1: 'Cardiovascular',
      2: 'Nervous/Brain',
      3: 'Respiratory',
      4: 'Digestive',
      5: 'Endocrine/Hormonal',
      6: 'Urinary/Renal',
      7: 'Reproductive',
      8: 'Integumentary (Skin)',
      9: 'Immune/Inflammatory',
      10: 'Sensory (Vision)',
      11: 'Sensory (Hearing)',
      12: 'Biological Age/Epigenetics'
    };

    // Group metrics by their properties
    for (const metric of metrics) {
      const metricEntry = {
        metric: metric.metric_name,
        system: systemNames[metric.system_id] || 'Unknown',
        units: metric.canonical_unit,
        normalRangeMin: metric.normal_min,
        normalRangeMax: metric.normal_max,
        synonyms: []
      };

      // Add synonyms for this metric
      const metricSynonyms = synonyms.filter(s => s.metric_id === metric.metric_id);
      for (const syn of metricSynonyms) {
        metricEntry.synonyms.push(syn.synonym_name);
      }

      // Only add if has synonyms or is a key metric
      if (metricEntry.synonyms.length > 0 || metric.is_key_metric) {
        metricsCatalog.metrics.push(metricEntry);
      }
    }

    // Create units synonyms from conversions
    const unitsMap = new Map();
    for (const conv of conversions) {
      if (!unitsMap.has(conv.canonical_unit)) {
        unitsMap.set(conv.canonical_unit, new Set());
      }
      if (conv.alt_unit && conv.alt_unit !== conv.canonical_unit) {
        unitsMap.get(conv.canonical_unit).add(conv.alt_unit);
      }
    }

    for (const [unit, alts] of unitsMap) {
      if (alts.size > 0) {
        metricsCatalog.units_synonyms[unit] = Array.from(alts);
      }
    }

    // Write updated JSON files
    const publicDataDir = path.join(__dirname, '../public/data');
    if (!fs.existsSync(publicDataDir)) {
      fs.mkdirSync(publicDataDir, { recursive: true });
    }

    // Update metrics.catalog.json
    const catalogPath = path.join(publicDataDir, 'metrics.catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify(metricsCatalog, null, 2));

    // Also update metrics.json for backward compatibility
    const metricsSimple = metrics.map(m => ({
      id: m.metric_id,
      name: m.metric_name,
      system: systemNames[m.system_id] || 'Unknown',
      unit: m.canonical_unit,
      normalMin: m.normal_min,
      normalMax: m.normal_max,
      isKey: m.is_key_metric
    }));

    const metricsPath = path.join(publicDataDir, 'metrics.json');
    fs.writeFileSync(metricsPath, JSON.stringify(metricsSimple, null, 2));

    console.log(`[ADMIN] Updated ${metricsCatalog.metrics.length} metrics in JSON files`);
    console.log(`[ADMIN] Added ${Object.keys(metricsCatalog.units_synonyms).length} unit synonyms`);
  }
}

module.exports = new AdminMasterService();


