const XLSX = require('xlsx');
const crypto = require('crypto');
const { pool } = require('../database/schema');

class SpreadsheetService {
  constructor() {
    this.expectedSheets = ['Metrics', 'Synonyms', 'Conversions'];
  }

  async parseExcelFile(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const data = {};
      this.expectedSheets.forEach((sheetName) => {
        if (workbook.SheetNames.includes(sheetName)) {
          data[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        }
      });
      return data;
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }

  calculateDataHash(data) {
    const jsonStr = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(jsonStr).digest('hex');
  }

  async detectChanges(oldData, newData) {
    // This is a simplified diff. A more robust implementation would compare row by row.
    return {
      metrics: {
        added: newData.Metrics.length - oldData.metrics.length,
        removed: oldData.metrics.length - newData.Metrics.length,
      },
      synonyms: {
        added: newData.Synonyms.length - oldData.synonyms.length,
        removed: oldData.synonyms.length - newData.Synonyms.length,
      },
      conversions: {
        added: newData.Conversions.length - oldData.conversions.length,
        removed: oldData.conversions.length - newData.Conversions.length,
      },
    };
  }

  async applyChanges(changes, versionId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Apply changes to the database
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async processSpreadsheetUpload(filePath, uploadedBy) {
    const client = await pool.connect();
    try {
      const newData = await this.parseExcelFile(filePath);
      const currentData = await this.getCurrentData();
      const dataHash = this.calculateDataHash(newData);
      const changes = await this.detectChanges(currentData, newData);
      const changeSummary = JSON.stringify(changes);

      const versionResult = await client.query(
        'INSERT INTO master_versions (change_summary, created_by, xlsx_path, data_hash) VALUES ($1, $2, $3, $4) RETURNING version_id',
        [changeSummary, uploadedBy, filePath, dataHash]
      );
      const versionId = versionResult.rows[0].version_id;

      await this.createSnapshot(versionId, currentData);
      await this.applyChanges(newData, versionId);

      await client.query('UPDATE master_versions SET is_active = false');
      await client.query('UPDATE master_versions SET is_active = true WHERE version_id = $1', [versionId]);

      return { versionId, changeSummary, changes, dataHash };
    } finally {
      client.release();
    }
  }

  async rollbackToVersion(versionId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const snapshotResult = await client.query('SELECT * FROM master_snapshots WHERE version_id = $1', [versionId]);
      if (snapshotResult.rows.length === 0) {
        throw new Error(`No snapshot found for version ${versionId}`);
      }
      const snapshot = snapshotResult.rows[0];
      await this.restoreFromSnapshot(snapshot);
      await client.query('UPDATE master_versions SET is_active = false');
      await client.query('UPDATE master_versions SET is_active = true WHERE version_id = $1', [versionId]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCurrentData() {
    const metrics = await pool.query('SELECT * FROM master_metrics');
    const synonyms = await pool.query('SELECT * FROM master_metric_synonyms');
    const conversions = await pool.query('SELECT * FROM master_conversion_groups');
    return { metrics: metrics.rows, synonyms: synonyms.rows, conversions: conversions.rows };
  }

  async createSnapshot(versionId, data) {
    await pool.query(
      'INSERT INTO master_snapshots (version_id, metrics_json, synonyms_json, conversion_groups_json) VALUES ($1, $2, $3, $4)',
      [versionId, JSON.stringify(data.metrics), JSON.stringify(data.synonyms), JSON.stringify(data.conversions)]
    );
  }

  async restoreFromSnapshot(snapshot) {
    await pool.query('TRUNCATE master_metrics, master_metric_synonyms, master_conversion_groups CASCADE');
    // Simplified restore logic. A more robust implementation would insert row by row.
    if (snapshot.metrics_json) {
      // ...
    }
    if (snapshot.synonyms_json) {
      // ...
    }
    if (snapshot.conversion_groups_json) {
      // ...
    }
  }
}

module.exports = new SpreadsheetService();
