const XLSX = require('xlsx');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Admin Controller
 * Manages master metrics spreadsheet, synonyms, and system configuration
 * Handles spreadsheet upload, versioning, and rollback
 */

/**
 * Upload and process master spreadsheet
 */
async function uploadMasterSpreadsheet(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No spreadsheet file provided'
      });
    }

    console.log('[Admin] Processing master spreadsheet upload');

    const filePath = req.file.path;
    const changeSummary = req.body.changeSummary || 'Spreadsheet update';
    const createdBy = req.user?.email || 'admin';

    // Parse Excel file
    const workbook = XLSX.readFile(filePath);
    
    // Extract data from sheets
    const metricsData = extractMetricsFromSheet(workbook);
    const synonymsData = extractSynonymsFromSheet(workbook);
    const conversionsData = extractConversionsFromSheet(workbook);

    // Calculate hash for change detection
    const dataHash = calculateDataHash(metricsData, synonymsData, conversionsData);

    // Check if data has changed
    const lastVersionResult = await req.db.query(
      'SELECT data_hash FROM master_versions ORDER BY version_id DESC LIMIT 1'
    );

    if (lastVersionResult.rows.length > 0 && lastVersionResult.rows[0].data_hash === dataHash) {
      return res.json({
        success: true,
        message: 'No changes detected in spreadsheet',
        unchanged: true
      });
    }

    // Create snapshot of current data before update
    const currentSnapshot = await createCurrentSnapshot(req.db);

    // Start transaction for atomic update
    const client = await req.db.connect();

    try {
      await client.query('BEGIN');

      // Detect changes
      const changes = await detectChanges(client, metricsData, synonymsData, conversionsData);

      // Create new version
      const versionResult = await client.query(`
        INSERT INTO master_versions (
          change_summary,
          created_by,
          xlsx_path,
          data_hash,
          added_count,
          changed_count,
          removed_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING version_id
      `, [
        changeSummary,
        createdBy,
        filePath,
        dataHash,
        changes.added.length,
        changes.changed.length,
        changes.removed.length
      ]);

      const versionId = versionResult.rows[0].version_id;

      // Store snapshot of new data
      await client.query(`
        INSERT INTO master_snapshots (
          version_id,
          metrics_json,
          synonyms_json,
          conversion_groups_json
        ) VALUES ($1, $2, $3, $4)
      `, [
        versionId,
        JSON.stringify(metricsData),
        JSON.stringify(synonymsData),
        JSON.stringify(conversionsData)
      ]);

      // Update master tables
      await updateMasterMetrics(client, metricsData);
      await updateMasterSynonyms(client, synonymsData);
      await updateMasterConversions(client, conversionsData);

      // Update JSON files for frontend
      await updateJsonFiles(metricsData, synonymsData, conversionsData);

      await client.query('COMMIT');

      console.log('[Admin] Spreadsheet processed successfully');
      console.log(`[Admin] Changes: +${changes.added.length} ~${changes.changed.length} -${changes.removed.length}`);

      res.json({
        success: true,
        data: {
          versionId: versionId,
          changes: changes,
          metricsCount: metricsData.length,
          synonymsCount: synonymsData.length,
          conversionsCount: conversionsData.length
        },
        message: 'Master spreadsheet updated successfully'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Upload master spreadsheet error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process master spreadsheet',
      message: error.message
    });
  }
}

/**
 * Extract metrics from spreadsheet
 */
function extractMetricsFromSheet(workbook) {
  const metricsSheet = workbook.Sheets['Metrics'] || workbook.Sheets['Sheet1'];
  
  if (!metricsSheet) {
    throw new Error('Metrics sheet not found in workbook');
  }

  const data = XLSX.utils.sheet_to_json(metricsSheet);
  
  return data.map(row => ({
    metric_id: row.metric_id || row.MetricID || row['Metric ID'],
    metric_name: row.metric_name || row.MetricName || row['Metric Name'],
    system_id: parseInt(row.system_id || row.SystemID || row['System ID'] || 1),
    canonical_unit: row.canonical_unit || row.Unit || row.unit,
    conversion_group_id: row.conversion_group_id || row.ConversionGroup,
    normal_min: parseFloat(row.normal_min || row.NormalMin || row['Min'] || 0),
    normal_max: parseFloat(row.normal_max || row.NormalMax || row['Max'] || 0),
    is_key_metric: row.is_key_metric === true || row.IsKey === true || row.key === true,
    source: row.source || 'spreadsheet',
    explanation: row.explanation || row.Explanation || ''
  })).filter(m => m.metric_id && m.metric_name);
}

/**
 * Extract synonyms from spreadsheet
 */
function extractSynonymsFromSheet(workbook) {
  const synonymsSheet = workbook.Sheets['Synonyms'];
  
  if (!synonymsSheet) {
    console.warn('[Admin] No Synonyms sheet found, skipping');
    return [];
  }

  const data = XLSX.utils.sheet_to_json(synonymsSheet);
  
  return data.map(row => ({
    synonym_id: row.synonym_id || row.SynonymID || row['Synonym ID'],
    metric_id: row.metric_id || row.MetricID || row['Metric ID'],
    synonym_name: row.synonym_name || row.Synonym || row['Synonym Name'],
    notes: row.notes || row.Notes || ''
  })).filter(s => s.synonym_name && s.metric_id);
}

/**
 * Extract conversions from spreadsheet
 */
function extractConversionsFromSheet(workbook) {
  const conversionsSheet = workbook.Sheets['Conversions'];
  
  if (!conversionsSheet) {
    console.warn('[Admin] No Conversions sheet found, skipping');
    return [];
  }

  const data = XLSX.utils.sheet_to_json(conversionsSheet);
  
  return data.map(row => ({
    conversion_group_id: row.conversion_group_id || row.GroupID || row['Group ID'],
    canonical_unit: row.canonical_unit || row.CanonicalUnit || row['Canonical Unit'],
    alt_unit: row.alt_unit || row.AltUnit || row['Alt Unit'],
    to_canonical_formula: row.to_canonical_formula || row.ToFormula || row['To Canonical'],
    from_canonical_formula: row.from_canonical_formula || row.FromFormula || row['From Canonical'],
    notes: row.notes || row.Notes || ''
  })).filter(c => c.conversion_group_id && c.alt_unit);
}

/**
 * Calculate hash of data for change detection
 */
function calculateDataHash(metrics, synonyms, conversions) {
  const combined = JSON.stringify({
    metrics: metrics,
    synonyms: synonyms,
    conversions: conversions
  });
  
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Create snapshot of current data
 */
async function createCurrentSnapshot(db) {
  const metricsResult = await db.query('SELECT * FROM master_metrics ORDER BY metric_id');
  const synonymsResult = await db.query('SELECT * FROM master_metric_synonyms ORDER BY id');
  const conversionsResult = await db.query('SELECT * FROM master_conversion_groups ORDER BY conversion_group_id, alt_unit');
  
  return {
    metrics: metricsResult.rows,
    synonyms: synonymsResult.rows,
    conversions: conversionsResult.rows
  };
}

/**
 * Detect changes between current and new data
 */
async function detectChanges(client, newMetrics, newSynonyms, newConversions) {
  const currentMetrics = await client.query('SELECT * FROM master_metrics');
  
  const currentMap = new Map(currentMetrics.rows.map(m => [m.metric_id, m]));
  const newMap = new Map(newMetrics.map(m => [m.metric_id, m]));
  
  const added = [];
  const changed = [];
  const removed = [];
  
  // Find added and changed
  for (const [metricId, newMetric] of newMap) {
    const currentMetric = currentMap.get(metricId);
    
    if (!currentMetric) {
      added.push(newMetric);
    } else if (JSON.stringify(currentMetric) !== JSON.stringify(newMetric)) {
      changed.push({
        old: currentMetric,
        new: newMetric
      });
    }
  }
  
  // Find removed
  for (const [metricId, currentMetric] of currentMap) {
    if (!newMap.has(metricId)) {
      removed.push(currentMetric);
    }
  }
  
  return { added, changed, removed };
}

/**
 * Update master_metrics table
 */
async function updateMasterMetrics(client, metricsData) {
  // Clear existing data
  await client.query('TRUNCATE master_metrics CASCADE');
  
  // Insert new data
  for (const metric of metricsData) {
    await client.query(`
      INSERT INTO master_metrics (
        metric_id,
        metric_name,
        system_id,
        canonical_unit,
        conversion_group_id,
        normal_min,
        normal_max,
        is_key_metric,
        source,
        explanation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (metric_id) DO UPDATE SET
        metric_name = EXCLUDED.metric_name,
        system_id = EXCLUDED.system_id,
        canonical_unit = EXCLUDED.canonical_unit,
        conversion_group_id = EXCLUDED.conversion_group_id,
        normal_min = EXCLUDED.normal_min,
        normal_max = EXCLUDED.normal_max,
        is_key_metric = EXCLUDED.is_key_metric,
        source = EXCLUDED.source,
        explanation = EXCLUDED.explanation,
        updated_at = CURRENT_TIMESTAMP
    `, [
      metric.metric_id,
      metric.metric_name,
      metric.system_id,
      metric.canonical_unit,
      metric.conversion_group_id,
      metric.normal_min,
      metric.normal_max,
      metric.is_key_metric,
      metric.source,
      metric.explanation
    ]);
  }
  
  console.log(`[Admin] Updated ${metricsData.length} metrics`);
}

/**
 * Update master_metric_synonyms table
 */
async function updateMasterSynonyms(client, synonymsData) {
  // Clear existing data
  await client.query('TRUNCATE master_metric_synonyms');
  
  // Insert new data
  for (const synonym of synonymsData) {
    await client.query(`
      INSERT INTO master_metric_synonyms (
        synonym_id,
        metric_id,
        synonym_name,
        notes
      ) VALUES ($1, $2, $3, $4)
    `, [
      synonym.synonym_id,
      synonym.metric_id,
      synonym.synonym_name,
      synonym.notes
    ]);
  }
  
  console.log(`[Admin] Updated ${synonymsData.length} synonyms`);
}

/**
 * Update master_conversion_groups table
 */
async function updateMasterConversions(client, conversionsData) {
  // Clear existing data
  await client.query('TRUNCATE master_conversion_groups');
  
  // Insert new data
  for (const conversion of conversionsData) {
    await client.query(`
      INSERT INTO master_conversion_groups (
        conversion_group_id,
        canonical_unit,
        alt_unit,
        to_canonical_formula,
        from_canonical_formula,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      conversion.conversion_group_id,
      conversion.canonical_unit,
      conversion.alt_unit,
      conversion.to_canonical_formula,
      conversion.from_canonical_formula,
      conversion.notes
    ]);
  }
  
  console.log(`[Admin] Updated ${conversionsData.length} conversions`);
}

/**
 * Update JSON files for frontend access
 */
async function updateJsonFiles(metrics, synonyms, conversions) {
  const dataDir = path.join(__dirname, '../public/data');
  
  await fs.mkdir(dataDir, { recursive: true });
  
  // Update metrics catalog
  await fs.writeFile(
    path.join(dataDir, 'metrics-catalog.json'),
    JSON.stringify(metrics, null, 2)
  );
  
  // Update synonyms
  await fs.writeFile(
    path.join(dataDir, 'metric-synonyms.json'),
    JSON.stringify(synonyms, null, 2)
  );
  
  // Update conversions
  await fs.writeFile(
    path.join(dataDir, 'conversion-groups.json'),
    JSON.stringify(conversions, null, 2)
  );
  
  console.log('[Admin] JSON files updated');
}

/**
 * Get version history
 */
async function getVersionHistory(req, res) {
  try {
    const result = await req.db.query(`
      SELECT *
      FROM master_versions
      ORDER BY version_id DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get version history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve version history',
      message: error.message
    });
  }
}

/**
 * Rollback to previous version
 */
async function rollbackToVersion(req, res) {
  try {
    const { versionId } = req.params;

    console.log(`[Admin] Rolling back to version ${versionId}`);

    // Get snapshot for this version
    const snapshotResult = await req.db.query(
      'SELECT * FROM master_snapshots WHERE version_id = $1',
      [versionId]
    );

    if (snapshotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Version snapshot not found'
      });
    }

    const snapshot = snapshotResult.rows[0];
    
    const metrics = JSON.parse(snapshot.metrics_json);
    const synonyms = JSON.parse(snapshot.synonyms_json);
    const conversions = JSON.parse(snapshot.conversion_groups_json);

    const client = await req.db.connect();

    try {
      await client.query('BEGIN');

      // Restore data
      await updateMasterMetrics(client, metrics);
      await updateMasterSynonyms(client, synonyms);
      await updateMasterConversions(client, conversions);

      // Update JSON files
      await updateJsonFiles(metrics, synonyms, conversions);

      // Create new version entry for rollback
      await client.query(`
        INSERT INTO master_versions (
          change_summary,
          created_by,
          data_hash
        ) VALUES ($1, $2, $3)
      `, [
        `Rollback to version ${versionId}`,
        req.user?.email || 'admin',
        calculateDataHash(metrics, synonyms, conversions)
      ]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Successfully rolled back to version ${versionId}`
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Rollback to version error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rollback',
      message: error.message
    });
  }
}

/**
 * Get current master data statistics
 */
async function getMasterStats(req, res) {
  try {
    const metricsCount = await req.db.query('SELECT COUNT(*) FROM master_metrics');
    const synonymsCount = await req.db.query('SELECT COUNT(*) FROM master_metric_synonyms');
    const conversionsCount = await req.db.query('SELECT COUNT(*) FROM master_conversion_groups');
    const versionsCount = await req.db.query('SELECT COUNT(*) FROM master_versions');

    const systemsBreakdown = await req.db.query(`
      SELECT 
        hs.name,
        COUNT(mm.metric_id) as metric_count
      FROM health_systems hs
      LEFT JOIN master_metrics mm ON hs.id = mm.system_id
      GROUP BY hs.id, hs.name
      ORDER BY hs.id
    `);

    res.json({
      success: true,
      data: {
        totalMetrics: parseInt(metricsCount.rows[0].count),
        totalSynonyms: parseInt(synonymsCount.rows[0].count),
        totalConversions: parseInt(conversionsCount.rows[0].count),
        totalVersions: parseInt(versionsCount.rows[0].count),
        systemsBreakdown: systemsBreakdown.rows
      }
    });

  } catch (error) {
    console.error('Get master stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
      message: error.message
    });
  }
}

module.exports = {
  uploadMasterSpreadsheet,
  getVersionHistory,
  rollbackToVersion,
  getMasterStats
};
