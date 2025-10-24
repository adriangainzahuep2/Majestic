const spreadsheetService = require('../services/spreadsheetService');

async function uploadMasterSpreadsheet(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No spreadsheet file provided' });
    }
    const result = await spreadsheetService.processSpreadsheetUpload(req.file.path, req.user?.email || 'admin');
    res.json({ success: true, data: result, message: 'Master spreadsheet updated successfully' });
  } catch (error) {
    console.error('Upload master spreadsheet error:', error);
    res.status(500).json({ success: false, error: 'Failed to process master spreadsheet', message: error.message });
  }
}

async function getVersionHistory(req, res) {
  try {
    const result = await req.db.query('SELECT * FROM master_versions ORDER BY version_id DESC LIMIT 50');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get version history error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve version history', message: error.message });
  }
}

async function rollbackToVersion(req, res) {
  try {
    const { versionId } = req.params;
    await spreadsheetService.rollbackToVersion(versionId);
    res.json({ success: true, message: `Successfully rolled back to version ${versionId}` });
  } catch (error) {
    console.error('Rollback to version error:', error);
    res.status(500).json({ success: false, error: 'Failed to rollback', message: error.message });
  }
}

async function getMasterStats(req, res) {
  try {
    const metricsCount = await req.db.query('SELECT COUNT(*) FROM master_metrics');
    const synonymsCount = await req.db.query('SELECT COUNT(*) FROM master_metric_synonyms');
    const conversionsCount = await req.db.query('SELECT COUNT(*) FROM master_conversion_groups');
    const versionsCount = await req.db.query('SELECT COUNT(*) FROM master_versions');
    const systemsBreakdown = await req.db.query(
      `SELECT hs.name, COUNT(mm.metric_id) as metric_count
       FROM health_systems hs
       LEFT JOIN master_metrics mm ON hs.id = mm.system_id
       GROUP BY hs.id, hs.name
       ORDER BY hs.id`
    );
    res.json({
      success: true,
      data: {
        totalMetrics: parseInt(metricsCount.rows[0].count),
        totalSynonyms: parseInt(synonymsCount.rows[0].count),
        totalConversions: parseInt(conversionsCount.rows[0].count),
        totalVersions: parseInt(versionsCount.rows[0].count),
        systemsBreakdown: systemsBreakdown.rows,
      },
    });
  } catch (error) {
    console.error('Get master stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve statistics', message: error.message });
  }
}

module.exports = {
  uploadMasterSpreadsheet,
  getVersionHistory,
  rollbackToVersion,
  getMasterStats,
};
