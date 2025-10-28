/**
 * Enhanced Spreadsheet Processing Service
 * Handles change analysis, version control, and rollback functionality
 */

const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');
const { pool } = require('../database/schema');

class SpreadsheetModuleService {
  constructor() {
    this.uploadPath = path.join(__dirname, '../../uploads/spreadsheets');
    this.versionPath = path.join(__dirname, '../../data/master_versions');
    this.backupPath = path.join(__dirname, '../../backups/spreadsheets');
  }

  /**
   * Process uploaded spreadsheet with change analysis
   */
  async processSpreadsheet(userId, file, testDate) {
    try {
      console.log(`[SPREADSHEET] Processing spreadsheet: ${file.originalname}`);
      
      // Step 1: Save and parse uploaded spreadsheet
      const spreadsheetData = await this.parseSpreadsheet(file);
      
      // Step 2: Load current master data
      const currentMasterData = await this.getCurrentMasterData();
      
      // Step 3: Analyze changes between current and new data
      const changeAnalysis = await this.analyzeChanges(currentMasterData, spreadsheetData);
      
      // Step 4: Validate database mapping
      const mappingValidation = await this.validateDatabaseMapping(changeAnalysis);
      
      // Step 5: Create version backup
      const versionInfo = await this.createVersionBackup(spreadsheetData, changeAnalysis);
      
      // Step 6: Apply changes if validation passes
      let appliedChanges = null;
      if (mappingValidation.isValid) {
        appliedChanges = await this.applyChanges(changeAnalysis, userId, testDate);
      }
      
      // Step 7: Generate rollback point
      const rollbackPoint = await this.createRollbackPoint();
      
      return {
        success: true,
        spreadsheetInfo: {
          filename: file.originalname,
          version: versionInfo.version,
          processedAt: new Date().toISOString()
        },
        changeAnalysis: {
          addedMetrics: changeAnalysis.added.length,
          modifiedMetrics: changeAnalysis.modified.length,
          deletedMetrics: changeAnalysis.deleted.length,
          details: changeAnalysis
        },
        mappingValidation: mappingValidation,
        appliedChanges: appliedChanges,
        rollbackInfo: {
          rollbackId: rollbackPoint.id,
          canRollback: true,
          createdAt: rollbackPoint.createdAt
        },
        recommendations: this.generateRecommendations(changeAnalysis, mappingValidation)
      };

    } catch (error) {
      console.error('[SPREADSHEET] Processing error:', error);
      throw new Error(`Spreadsheet processing failed: ${error.message}`);
    }
  }

  /**
   * Analyze changes between current and new spreadsheet data
   */
  async analyzeChanges(currentData, newData) {
    try {
      console.log('[SPREADSHEET] Analyzing changes...');
      
      const currentMap = this.createMetricMap(currentData);
      const newMap = this.createMetricMap(newData);
      
      const changes = {
        added: [],
        modified: [],
        deleted: [],
        summary: {
          totalCurrent: currentMap.size,
          totalNew: newMap.size,
          changesCount: 0
        }
      };
      
      // Find added metrics
      for (const [key, metric] of newMap.entries()) {
        if (!currentMap.has(key)) {
          changes.added.push({
            metric: metric.metric,
            system: metric.system,
            changes: {
              new: true,
              old: null
            }
          });
        }
      }
      
      // Find modified and deleted metrics
      for (const [key, metric] of currentMap.entries()) {
        if (newMap.has(key)) {
          const newMetric = newMap.get(key);
          const modification = this.detectModifications(metric, newMetric);
          
          if (modification.hasChanges) {
            changes.modified.push({
              metric: metric.metric,
              system: metric.system,
              changes: modification.changes
            });
          }
        } else {
          changes.deleted.push({
            metric: metric.metric,
            system: metric.system,
            changes: {
              new: null,
              old: {
                normalRangeMin: metric.normalRangeMin,
                normalRangeMax: metric.normalRangeMax,
                system: metric.system
              }
            }
          });
        }
      }
      
      changes.summary.changesCount = changes.added.length + changes.modified.length + changes.deleted.length;
      
      console.log(`[SPREADSHEET] Changes: +${changes.added.length}, ~${changes.modified.length}, -${changes.deleted.length}`);
      
      return changes;

    } catch (error) {
      console.error('[SPREADSHEET] Change analysis error:', error);
      throw error;
    }
  }

  /**
   * Validate database mapping for proposed changes
   */
  async validateDatabaseMapping(changeAnalysis) {
    try {
      console.log('[SPREADSHEET] Validating database mapping...');
      
      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        mappings: []
      };
      
      // Validate added metrics
      for (const addition of changeAnalysis.added) {
        try {
          // Check if system exists
          const systemId = await this.getSystemId(addition.system);
          if (!systemId) {
            validation.errors.push(`Unknown system: ${addition.system}`);
            validation.isValid = false;
          }
          
          // Check for data type issues
          if (addition.changes.normalRangeMin === null || addition.changes.normalRangeMax === null) {
            validation.warnings.push(`Missing reference ranges for: ${addition.metric}`);
          }
          
          validation.mappings.push({
            action: 'add',
            metric: addition.metric,
            system: addition.system,
            systemId: systemId,
            status: 'ready'
          });
          
        } catch (error) {
          validation.errors.push(`Mapping error for ${addition.metric}: ${error.message}`);
          validation.isValid = false;
        }
      }
      
      // Validate modified metrics
      for (const modification of changeAnalysis.modified) {
        try {
          // Check if metric exists in database
          const existingMetric = await this.getExistingMetric(modification.metric);
          if (!existingMetric) {
            validation.errors.push(`Modified metric not found in database: ${modification.metric}`);
            validation.isValid = false;
          }
          
          // Check for data type consistency
          if (this.hasDataTypeIssues(modification.changes)) {
            validation.warnings.push(`Data type issues detected for: ${modification.metric}`);
          }
          
          validation.mappings.push({
            action: 'modify',
            metric: modification.metric,
            system: modification.system,
            existingId: existingMetric?.id,
            status: 'ready'
          });
          
        } catch (error) {
          validation.errors.push(`Validation error for ${modification.metric}: ${error.message}`);
          validation.isValid = false;
        }
      }
      
      // Validate deleted metrics
      for (const deletion of changeAnalysis.deleted) {
        try {
          // Check if metric is used in existing data
          const usageCount = await this.checkMetricUsage(deletion.metric);
          if (usageCount > 0) {
            validation.errors.push(`Cannot delete metric in use: ${deletion.metric} (${usageCount} records)`);
            validation.isValid = false;
          }
          
          validation.mappings.push({
            action: 'delete',
            metric: deletion.metric,
            system: deletion.system,
            usageCount: usageCount,
            status: usageCount > 0 ? 'blocked' : 'ready'
          });
          
        } catch (error) {
          validation.errors.push(`Deletion validation error for ${deletion.metric}: ${error.message}`);
          validation.isValid = false;
        }
      }
      
      console.log(`[SPREADSHEET] Validation: ${validation.isValid ? 'PASSED' : 'FAILED'} (${validation.errors.length} errors, ${validation.warnings.length} warnings)`);
      
      return validation;

    } catch (error) {
      console.error('[SPREADSHEET] Mapping validation error:', error);
      throw error;
    }
  }

  /**
   * Apply validated changes to the database
   */
  async applyChanges(changeAnalysis, userId, testDate) {
    try {
      console.log('[SPREADSHEET] Applying changes...');
      
      const results = {
        applied: [],
        failed: [],
        summary: {
          total: 0,
          successful: 0,
          failed: 0
        }
      };
      
      // Start transaction
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Apply additions
        for (const addition of changeAnalysis.added) {
          try {
            await this.applyAddition(client, addition, userId, testDate);
            results.applied.push({ action: 'add', metric: addition.metric });
          } catch (error) {
            results.failed.push({ action: 'add', metric: addition.metric, error: error.message });
          }
        }
        
        // Apply modifications
        for (const modification of changeAnalysis.modified) {
          try {
            await this.applyModification(client, modification, userId, testDate);
            results.applied.push({ action: 'modify', metric: modification.metric });
          } catch (error) {
            results.failed.push({ action: 'modify', metric: modification.metric, error: error.message });
          }
        }
        
        // Apply deletions (only if no usage)
        for (const deletion of changeAnalysis.deleted) {
          try {
            const usageCount = await this.checkMetricUsage(deletion.metric);
            if (usageCount === 0) {
              await this.applyDeletion(client, deletion, userId, testDate);
              results.applied.push({ action: 'delete', metric: deletion.metric });
            }
          } catch (error) {
            results.failed.push({ action: 'delete', metric: deletion.metric, error: error.message });
          }
        }
        
        await client.query('COMMIT');
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
      results.summary.total = changeAnalysis.added.length + changeAnalysis.modified.length + changeAnalysis.deleted.length;
      results.summary.successful = results.applied.length;
      results.summary.failed = results.failed.length;
      
      console.log(`[SPREADSHEET] Changes applied: ${results.summary.successful}/${results.summary.total}`);
      
      return results;

    } catch (error) {
      console.error('[SPREADSHEET] Apply changes error:', error);
      throw error;
    }
  }

  /**
   * Create version backup of spreadsheet data
   */
  async createVersionBackup(spreadsheetData, changeAnalysis) {
    try {
      const version = `v${Date.now()}`;
      const timestamp = new Date().toISOString();
      
      // Create version directory
      const versionDir = path.join(this.versionPath, version);
      await fs.mkdir(versionDir, { recursive: true });
      
      // Save spreadsheet data
      const spreadsheetPath = path.join(versionDir, 'spreadsheet.json');
      await fs.writeFile(spreadsheetPath, JSON.stringify(spreadsheetData, null, 2));
      
      // Save change analysis
      const changesPath = path.join(versionDir, 'changes.json');
      await fs.writeFile(changesPath, JSON.stringify(changeAnalysis, null, 2));
      
      // Create version metadata
      const metadata = {
        version,
        timestamp,
        dataCount: spreadsheetData.length,
        changes: {
          added: changeAnalysis.added.length,
          modified: changeAnalysis.modified.length,
          deleted: changeAnalysis.deleted.length
        },
        checksum: await this.calculateChecksum(spreadsheetData)
      };
      
      const metadataPath = path.join(versionDir, 'metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`[SPREADSHEET] Created version backup: ${version}`);
      
      return {
        version,
        timestamp,
        path: versionDir,
        metadata
      };

    } catch (error) {
      console.error('[SPREADSHEET] Version backup error:', error);
      throw error;
    }
  }

  /**
   * Create rollback point for emergency recovery
   */
  async createRollbackPoint() {
    try {
      const rollbackId = `rollback_${Date.now()}`;
      const timestamp = new Date().toISOString();
      
      // Get current database state
      const currentState = await this.captureCurrentState();
      
      // Save rollback point
      const rollbackPath = path.join(this.backupPath, `${rollbackId}.json`);
      await fs.writeFile(rollbackPath, JSON.stringify({
        rollbackId,
        timestamp,
        state: currentState,
        checksum: await this.calculateChecksum(currentState)
      }, null, 2));
      
      return {
        id: rollbackId,
        createdAt: timestamp,
        path: rollbackPath
      };

    } catch (error) {
      console.error('[SPREADSHEET] Rollback point creation error:', error);
      throw error;
    }
  }

  /**
   * Rollback to previous version
   */
  async rollbackToVersion(version, userId) {
    try {
      console.log(`[SPREADSHEET] Rolling back to version: ${version}`);
      
      // Load version data
      const versionData = await this.loadVersionData(version);
      if (!versionData) {
        throw new Error(`Version not found: ${version}`);
      }
      
      // Capture current state for backup
      const currentState = await this.captureCurrentState();
      const emergencyBackup = await this.createEmergencyBackup(currentState);
      
      // Apply version data
      const rollbackResult = await this.applyVersionData(versionData, userId);
      
      return {
        success: true,
        version,
        rollbackId: emergencyBackup.id,
        appliedChanges: rollbackResult,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[SPREADSHEET] Rollback error:', error);
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Parse uploaded spreadsheet
   */
  async parseSpreadsheet(file) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file.path);
      
      const worksheet = workbook.getWorksheet(1);
      const data = [];
      
      // Read header row
      const headers = [];
      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cell.value;
      });
      
      // Read data rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          rowData[header] = cell.value;
        });
        
        // Only include rows with metric names
        if (rowData.Metric || rowData.metric) {
          data.push({
            metric: rowData.Metric || rowData.metric,
            system: rowData.System || rowData.system,
            normalRangeMin: this.parseNumeric(rowData.NormalRangeMin || rowData.normalRangeMin),
            normalRangeMax: this.parseNumeric(rowData.NormalRangeMax || rowData.normalRangeMax),
            units: rowData.Units || rowData.units,
            synonyms: this.parseSynonyms(rowData.Synonyms || rowData.synonyms)
          });
        }
      });
      
      console.log(`[SPREADSHEET] Parsed ${data.length} metrics`);
      
      return data;

    } catch (error) {
      console.error('[SPREADSHEET] Spreadsheet parsing error:', error);
      throw error;
    }
  }

  // Helper methods
  createMetricMap(data) {
    const map = new Map();
    data.forEach(metric => {
      map.set(metric.metric.toLowerCase(), metric);
    });
    return map;
  }

  detectModifications(oldMetric, newMetric) {
    const changes = {};
    let hasChanges = false;
    
    const fields = ['normalRangeMin', 'normalRangeMax', 'units', 'system'];
    
    fields.forEach(field => {
      const oldValue = oldMetric[field];
      const newValue = newMetric[field];
      
      if (oldValue !== newValue) {
        changes[field] = {
          old: oldValue,
          new: newValue
        };
        hasChanges = true;
      }
    });
    
    return { hasChanges, changes };
  }

  async getCurrentMasterData() {
    // Implementation would load current master spreadsheet data
    return [];
  }

  async getSystemId(systemName) {
    // Implementation would query systems table
    return 1;
  }

  async getExistingMetric(metricName) {
    // Implementation would query metrics table
    return null;
  }

  hasDataTypeIssues(changes) {
    // Check if ranges are null when they shouldn't be
    return (changes.normalRangeMin?.new === null || changes.normalRangeMax?.new === null);
  }

  async checkMetricUsage(metricName) {
    // Implementation would count usage in metrics table
    return 0;
  }

  async applyAddition(client, addition, userId, testDate) {
    // Implementation would insert new metric
  }

  async applyModification(client, modification, userId, testDate) {
    // Implementation would update existing metric
  }

  async applyDeletion(client, deletion, userId, testDate) {
    // Implementation would delete metric
  }

  async captureCurrentState() {
    // Implementation would capture current database state
    return [];
  }

  async calculateChecksum(data) {
    // Implementation would calculate data checksum
    return 'checksum';
  }

  parseNumeric(value) {
    if (value === null || value === undefined) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  parseSynonyms(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return value.split(',').map(s => s.trim()).filter(s => s);
  }

  generateRecommendations(changeAnalysis, mappingValidation) {
    const recommendations = [];
    
    if (changeAnalysis.added.length > 0) {
      recommendations.push({
        type: 'addition',
        message: `Consider adding synonyms for ${changeAnalysis.added.length} new metrics to improve matching`,
        priority: 'medium'
      });
    }
    
    if (mappingValidation.warnings.length > 0) {
      recommendations.push({
        type: 'validation',
        message: `${mappingValidation.warnings.length} warnings need attention`,
        priority: 'high'
      });
    }
    
    return recommendations;
  }

  // Additional helper methods would be implemented here...
  async loadVersionData(version) { return null; }
  async createEmergencyBackup(state) { return { id: 'backup_id' }; }
  async applyVersionData(versionData, userId) { return {}; }
}

module.exports = new SpreadsheetModuleService();
