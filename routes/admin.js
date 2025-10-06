const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const adminMasterService = require('../services/adminMasterService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// TEMPORARILY DISABLED AUTH - All routes unprotected
// router.use(authMiddleware, authMiddleware.adminOnly);
// ⚠️ TO RE-ENABLE: Uncomment the line above

// Download current (live) template: always serve latest committed version
router.get('/template', async (req, res) => {
  try {
    // 1) Try latest committed version file
    const latest = await req.db.query('SELECT version_id, xlsx_path FROM master_versions ORDER BY version_id DESC LIMIT 1');
    if (latest.rows.length > 0) {
      const { version_id, xlsx_path } = latest.rows[0];
      if (xlsx_path && fs.existsSync(xlsx_path)) {
        return res.download(xlsx_path, `master_version_${version_id}.xlsx`);
      }
      // 2) Reconstruct from snapshot if original not present
      const snap = await req.db.query('SELECT metrics_json, synonyms_json, conversion_groups_json FROM master_snapshots WHERE version_id = $1', [version_id]);
      if (snap.rows.length > 0) {
        const wb = XLSX.utils.book_new();
        const metricsHeaders = ['metric_id','metric_name','system_id','canonical_unit','conversion_group_id','normal_min','normal_max','is_key_metric','source','explanation'];
        const metricsRows = [metricsHeaders, ...(snap.rows[0].metrics_json || []).map(r => [
          r.metric_id, r.metric_name, r.system_id, r.canonical_unit, r.conversion_group_id, r.normal_min, r.normal_max, (String(r.is_key_metric).toUpperCase()==='Y' || r.is_key_metric) ? 'Y' : 'N', r.source, r.explanation
        ])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metricsRows), 'metrics');

        const synHeaders = ['synonym_id','metric_id','synonym_name','notes'];
        const synRows = [synHeaders, ...(snap.rows[0].synonyms_json || []).map(r => [r.synonym_id, r.metric_id, r.synonym_name, r.notes || null])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synRows), 'synonyms');

        const convHeaders = ['conversion_group_id','canonical_unit','alt_unit','to_canonical_formula','from_canonical_formula','notes'];
        const convRows = [convHeaders, ...(snap.rows[0].conversion_groups_json || []).map(r => [
          r.conversion_group_id, r.canonical_unit, r.alt_unit, r.to_canonical_formula, r.from_canonical_formula, r.notes || null
        ])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(convRows), 'conversion_groups');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', `attachment; filename="master_version_${version_id}.xlsx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(Buffer.from(buf));
      }
    }

    // 3) If no versions yet, export current DB live snapshot (if any), else fallback to blank headers
    try {
      const buf = await adminMasterService.exportCurrentAsWorkbookBuffer();
      if (buf && buf.length > 0) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="master_template.xlsx"');
        return res.send(buf);
      }
    } catch (e) {
      console.warn('[ADMIN] export live workbook failed, falling back to headers-only template', e.message);
    }

    const wb = XLSX.utils.book_new();
    const metricsHeaders = ['metric_id','metric_name','system_id','canonical_unit','conversion_group_id','normal_min','normal_max','is_key_metric','source','explanation'];
    const synonymsHeaders = ['synonym_id','metric_id','synonym_name','notes'];
    const convHeaders = ['conversion_group_id','canonical_unit','alt_unit','to_canonical_formula','from_canonical_formula','notes'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([metricsHeaders]), 'metrics');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([synonymsHeaders]), 'synonyms');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([convHeaders]), 'conversion_groups');
    const fallback = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="master_template.xlsx"');
    return res.send(Buffer.from(fallback));
  } catch (e) {
    console.error('[ADMIN] template download error', e);
    return res.status(500).json({ error: 'template_download_failed', message: e.message });
  }
});

// Validate (dry-run)
router.post('/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const parsed = adminMasterService.parseWorkbook(req.file.buffer);
    const validation = adminMasterService.validate(parsed);
    const diff = validation.valid ? await adminMasterService.diff(parsed) : { added: 0, changed: 0, removed: 0 };
    const detailed = validation.valid ? await adminMasterService.diffDetailed(parsed) : null;
    res.json({ success: validation.valid, errors: validation.errors, diff, detailed });
  } catch (e) {
    console.error('[ADMIN] validate error', e);
    res.status(500).json({ error: 'validate_failed', message: e.message });
  }
});

// Commit new version
router.post('/commit', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const changeSummary = req.body.change_summary || '';
    if (!changeSummary || changeSummary.length < 4) return res.status(400).json({ error: 'summary_required' });
    const result = await adminMasterService.commit(req.file.buffer, changeSummary, 'admin-temporary');
    res.json(result);
  } catch (e) {
    console.error('[ADMIN] commit error', e);
    res.status(500).json({ error: 'commit_failed', message: e.message });
  }
});

// List versions
router.get('/versions', async (req, res) => {
  try {
    const versions = await adminMasterService.versions();
    res.json({ versions });
  } catch (e) {
    console.error('[ADMIN] versions error', e);
    res.status(500).json({ error: 'versions_failed', message: e.message });
  }
});

// Rollback
router.post('/rollback/:versionId', async (req, res) => {
  try {
    const versionId = parseInt(req.params.versionId, 10);
    const result = await adminMasterService.rollback(versionId);
    res.json(result);
  } catch (e) {
    console.error('[ADMIN] rollback error', e);
    res.status(500).json({ error: 'rollback_failed', message: e.message });
  }
});

// Download specific version as XLSX (original if present, else reconstructed)
router.get('/version/:versionId/download', async (req, res) => {
  try {
    const id = parseInt(req.params.versionId, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'invalid_version_id' });

    // Try original path
    const ver = await req.db.query('SELECT xlsx_path FROM master_versions WHERE version_id = $1', [id]);
    const xlsxPath = ver.rows?.[0]?.xlsx_path;
    if (xlsxPath && fs.existsSync(xlsxPath)) {
      return res.download(xlsxPath, `master_version_${id}.xlsx`);
    }

    // Reconstruct from snapshots
    const snap = await req.db.query('SELECT metrics_json, synonyms_json, conversion_groups_json FROM master_snapshots WHERE version_id = $1', [id]);
    if (snap.rows.length === 0) return res.status(404).json({ error: 'snapshot_not_found' });

    const wb = XLSX.utils.book_new();

    const metricsHeaders = ['metric_id','metric_name','system_id','canonical_unit','conversion_group_id','normal_min','normal_max','is_key_metric','source','explanation'];
    const metricsRows = [metricsHeaders, ...(snap.rows[0].metrics_json || []).map(r => [
      r.metric_id, r.metric_name, r.system_id, r.canonical_unit, r.conversion_group_id, r.normal_min, r.normal_max, (String(r.is_key_metric).toUpperCase()==='Y' || r.is_key_metric) ? 'Y' : 'N', r.source, r.explanation
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metricsRows), 'metrics');

    const synHeaders = ['synonym_id','metric_id','synonym_name','notes'];
    const synRows = [synHeaders, ...(snap.rows[0].synonyms_json || []).map(r => [r.synonym_id, r.metric_id, r.synonym_name, r.notes || null])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synRows), 'synonyms');

    const convHeaders = ['conversion_group_id','canonical_unit','alt_unit','to_canonical_formula','from_canonical_formula','notes'];
    const convRows = [convHeaders, ...(snap.rows[0].conversion_groups_json || []).map(r => [
      r.conversion_group_id, r.canonical_unit, r.alt_unit, r.to_canonical_formula, r.from_canonical_formula, r.notes || null
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(convRows), 'conversion_groups');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="master_version_${id}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error('[ADMIN] download version failed', e);
    return res.status(500).json({ error: 'download_failed', message: e.message });
  }
});

module.exports = router;


