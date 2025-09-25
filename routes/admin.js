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

// Download blank template
router.get('/template', async (req, res) => {
  const templatePath = path.join(__dirname, '../public/data/master_template.xlsx');
  if (fs.existsSync(templatePath)) {
    res.download(templatePath, 'master_template.xlsx');
    return;
  }

  try {
    // If master data exists in DB, export current live snapshot as workbook
    const buf = await adminMasterService.exportCurrentAsWorkbookBuffer();
    if (buf && buf.length > 0) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="master_template.xlsx"');
      res.send(buf);
      return;
    }
  } catch (e) {
    console.warn('[ADMIN] export live workbook failed, falling back to headers-only template', e.message);
  }

  // Fallback: headers-only template
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
  res.send(Buffer.from(fallback));
});

// Validate (dry-run)
router.post('/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file_required' });
    const parsed = adminMasterService.parseWorkbook(req.file.buffer);
    const validation = adminMasterService.validate(parsed);
    const diff = validation.valid ? await adminMasterService.diff(parsed) : { added: 0, changed: 0, removed: 0 };
    res.json({ success: validation.valid, errors: validation.errors, diff });
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

module.exports = router;


