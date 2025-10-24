const path = require('path');
const fs = require('fs').promises;
const healthSystemsService = require('./healthSystems');
const { pool } = require('../database/schema');

class IngestionService {
  constructor() {
    this.openaiService = require('./openai');
    this.visualStudyService = require('./visualStudyService');
    this.thumbnailService = require('./thumbnailService');
    this.metricSuggestionService = require('./metricSuggestionService');
  }

  async processFile({ userId, file, testDate }) {
    try {
      console.log(`[PIPELINE] Processing file: ${file.originalname}`);
      const classification = await this.classifyFile(file);
      console.log(`[CLASSIFICATION] File type: ${classification.dataType}, Study: ${classification.studyType}`);

      switch (classification.dataType) {
        case 'lab':
          return await this.processLabFile(userId, file, testDate);
        case 'visual':
          return await this.processVisualFile(userId, file, testDate, classification);
        case 'mixed':
          return await this.processMixedFile(userId, file, testDate, classification);
        default:
          throw new Error(`Unknown data type: ${classification.dataType}`);
      }
    } catch (error) {
      console.error('[PIPELINE] Processing failed:', error);
      throw error;
    }
  }

  async classifyFile(file) {
    try {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      if (['.dcm', '.dicom'].includes(fileExtension) || file.mimetype.includes('dicom')) {
        return { dataType: 'visual', studyType: 'unknown', linkedSystemId: null };
      }

      const classificationPrompt = `
        Classify this medical file based on its filename and content.
        Filename: ${file.originalname}
        File type: ${file.mimetype}
        Determine:
        1. dataType: "lab", "visual", or "mixed"
        2. studyType: "eye_topography", "oct", "fundus", "mri", "ct", "xray", "dexa", "ecg", "eeg", "unknown"
        3. linkedSystemId: which body system this belongs to (1-13)
        Body Systems: 1: Cardiovascular, 2: Nervous/Brain, 3: Respiratory, 4: Muscular, 5: Skeletal, 6: Digestive, 7: Endocrine, 8: Urinary, 9: Reproductive, 10: Integumentary, 11: Immune/Inflammation, 12: Sensory, 13: Genetics & Biological Age
        Return JSON only: { "dataType": "...", "studyType": "...", "linkedSystemId": ... }
      `;
      const response = await this.openaiService.generateCompletion(classificationPrompt, file.base64Data, file.originalname);
      let cleanResponse = response.trim().replace(/```json\s*/, '').replace(/```$/, '').replace(/```\s*/, '').replace(/```$/, '');
      return JSON.parse(cleanResponse);
    } catch (error) {
      console.warn('[CLASSIFICATION] Failed, defaulting to lab processing:', error.message);
      return { dataType: 'lab', studyType: 'unknown', linkedSystemId: null };
    }
  }

  async processLabFile(userId, file, testDate) {
    console.log('[LAB] Processing lab file...');
    const extractedData = await this.openaiService.processLabReport(file.base64Data, file.originalname);
    const uploadResult = await pool.query(
      `INSERT INTO uploads (user_id, filename, file_type, file_size, upload_type, processing_status)
       VALUES ($1, $2, $3, $4, 'manual', 'completed') RETURNING id`,
      [userId, file.originalname, file.mimetype, file.size]
    );
    const uploadId = uploadResult.rows[0].id;

    if (extractedData.metrics) {
      await this.saveMetricsToDatabase(userId, uploadId, extractedData.metrics, testDate);
      const insightsRefreshService = require('./insightsRefresh');
      const affectedSystems = this.getAffectedSystems(userId, extractedData.metrics);
      await insightsRefreshService.processUploadRefresh(require('../database/schema').pool, userId, affectedSystems);
      console.log(`[INSIGHTS TRIGGERED] Lab file processing completed, insights refresh queued for ${affectedSystems.size} systems`);
    }

    return {
      status: 'processed',
      dataType: 'lab',
      metricsCount: extractedData.metrics?.length || 0,
      message: `Processed ${extractedData.metrics?.length || 0} lab metrics`,
    };
  }

  async processVisualFile(userId, file, testDate, classification) {
    console.log('[VISUAL] Processing visual study...');
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (['.dcm', '.dicom'].includes(fileExtension)) {
      return await this.handleDicomFile(userId, file, testDate);
    }

    const fileUrl = await this.storeFile(file);
    const thumbnailUrl = await this.thumbnailService.generateThumbnail(fileUrl, fileExtension);
    const studyData = await this.visualStudyService.extractStudyData(file.base64Data, file.originalname, classification.studyType);
    const studyId = await this.saveImagingStudy({
      userId,
      fileUrl,
      thumbnailUrl,
      testDate: studyData.dateFoundInImage || testDate,
      studyType: studyData.studyType || classification.studyType,
      linkedSystemId: this.mapStudyTypeToSystem(studyData.studyType || classification.studyType),
      metricsJson: studyData.measurements || [],
      aiSummary: studyData.summary,
      status: 'processed',
    });

    await this.generateStudyComparison(studyId, userId, studyData.studyType);

    if (studyData.studyType && this.mapStudyTypeToSystem(studyData.studyType || classification.studyType)) {
      const insightsRefreshService = require('./insightsRefresh');
      const linkedSystemId = this.mapStudyTypeToSystem(studyData.studyType || classification.studyType);
      const affectedSystems = new Set([linkedSystemId]);
      await insightsRefreshService.processUploadRefresh(require('../database/schema').pool, userId, affectedSystems);
      console.log(`[INSIGHTS TRIGGERED] Visual study processing completed, insights refresh queued for system ${linkedSystemId}`);
    }

    return {
      status: 'processed',
      dataType: 'visual',
      studyType: studyData.studyType,
      studyId,
      aiSummary: studyData.summary,
      metricsJson: studyData.measurements,
      message: 'Visual study processed successfully',
    };
  }

  async processMixedFile(userId, file, testDate, classification) {
    console.log('[MIXED] Processing mixed file...');
    const [labResult, visualResult] = await Promise.allSettled([
      this.processLabFile(userId, file, testDate),
      this.processVisualFile(userId, file, testDate, classification),
    ]);
    return {
      status: 'processed',
      dataType: 'mixed',
      labProcessing: labResult.status === 'fulfilled' ? labResult.value : { error: labResult.reason?.message },
      visualProcessing: visualResult.status === 'fulfilled' ? visualResult.value : { error: visualResult.reason?.message },
      message: 'Mixed file processed with both lab and visual components',
    };
  }

  async handleDicomFile(userId, file, testDate) {
    console.log('[DICOM] Storing DICOM file without processing...');
    const fileUrl = await this.storeFile(file);
    const studyId = await this.saveImagingStudy({
      userId,
      fileUrl,
      thumbnailUrl: null,
      testDate,
      studyType: 'unknown',
      linkedSystemId: null,
      metricsJson: [],
      aiSummary: 'DICOM file stored. Processing not available in Phase 1.',
      status: 'failedExtraction',
    });
    return {
      status: 'failedExtraction',
      dataType: 'visual',
      studyType: 'dicom',
      studyId,
      message: 'DICOM file stored but not processed in Phase 1',
    };
  }

  async storeFile(file) {
    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join('./uploads', fileName);
    await fs.writeFile(filePath, Buffer.from(file.base64Data, 'base64'));
    return filePath;
  }

  async saveImagingStudy(studyData) {
    const result = await pool.query(
      `INSERT INTO imaging_studies (user_id, linked_system_id, study_type, file_url, thumbnail_url, test_date, ai_summary, metrics_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) RETURNING id`,
      [
        studyData.userId,
        studyData.linkedSystemId,
        studyData.studyType,
        studyData.fileUrl,
        studyData.thumbnailUrl,
        studyData.testDate,
        studyData.aiSummary,
        JSON.stringify(studyData.metricsJson),
        studyData.status,
      ]
    );
    return result.rows[0].id;
  }

  async generateStudyComparison(currentStudyId, userId, studyType) {
    try {
      const previousStudies = await pool.query(
        `SELECT * FROM imaging_studies WHERE user_id = $1 AND study_type = $2 AND id != $3 ORDER BY test_date DESC LIMIT 5`,
        [userId, studyType, currentStudyId]
      );
      if (previousStudies.rows.length === 0) return;

      const currentStudy = await pool.query('SELECT * FROM imaging_studies WHERE id = $1', [currentStudyId]);
      const comparison = await this.visualStudyService.generateComparison(currentStudy.rows[0], previousStudies.rows[0], previousStudies.rows);

      await pool.query(
        `UPDATE imaging_studies SET comparison_summary = $1, metric_changes_json = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [comparison.trendSummary, JSON.stringify(comparison.metricChanges), currentStudyId]
      );
    } catch (error) {
      console.error('[COMPARISON] Failed to generate study comparison:', error);
    }
  }

  mapStudyTypeToSystem(studyType) {
    const mapping = {
      eye_topography: 12, keratometry: 12, oct: 12, fundus: 12, mri: 2, ct: 2, xray: 5, dexa: 5, ecg: 1, eeg: 2, unknown: null
    };
    console.log(`[MAPPING] studyType="${studyType}" -> systemId=${mapping[studyType] || null}`);
    return mapping[studyType] || null;
  }

  async saveMetricsToDatabase(userId, uploadId, metrics, testDate) {
    const processedMetrics = await this.metricSuggestionService.processMetrics({ metrics, testDate, userId });
    await this._saveProcessedMetrics(userId, uploadId, processedMetrics.exact_matches, testDate);
    if (processedMetrics.unmatched_metrics.length > 0) {
      await this._savePendingMetrics(userId, uploadId, processedMetrics, testDate);
    }
    return {
      saved_metrics: processedMetrics.exact_matches.length,
      pending_review: processedMetrics.unmatched_metrics.length,
      suggestions: processedMetrics.ai_suggestions,
    };
  }

  async _saveProcessedMetrics(userId, uploadId, processedMetrics, testDate) {
    const catalog = require('../shared/metricsCatalog');
    for (const metric of processedMetrics) {
      try {
        const metricName = metric.standard_name || metric.name;
        const systemId = healthSystemsService.mapMetricToSystem(metricName, metric.category);
        const range = catalog.getRangeForName(metricName);
        const referenceRange = range && range.min !== undefined && range.max !== undefined ? `${range.min}-${range.max}` : metric.reference_range;
        const isKeyMetric = healthSystemsService.isKeyMetric(systemId, metricName);

        await pool.query(
          `INSERT INTO metrics (user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, test_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (user_id, metric_name, test_date, upload_id) DO UPDATE SET
             metric_value = EXCLUDED.metric_value,
             metric_unit = EXCLUDED.metric_unit,
             reference_range = EXCLUDED.reference_range,
             is_key_metric = EXCLUDED.is_key_metric`,
          [userId, uploadId, systemId, metricName, metric.value, metric.unit, referenceRange, isKeyMetric, testDate]
        );
      } catch (error) {
        console.error('Error saving processed metric:', error);
      }
    }
  }

  async _savePendingMetrics(userId, uploadId, processedResults, testDate) {
    try {
      await pool.query(
        `INSERT INTO pending_metric_suggestions (user_id, upload_id, unmatched_metrics, ai_suggestions, test_date, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT (user_id, upload_id) DO UPDATE SET
           unmatched_metrics = EXCLUDED.unmatched_metrics,
           ai_suggestions = EXCLUDED.ai_suggestions,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, uploadId, JSON.stringify(processedResults.unmatched_metrics), JSON.stringify(processedResults.ai_suggestions), testDate]
      );
      console.log(`[METRIC_SUGGESTIONS] Saved ${processedResults.unmatched_metrics.length} metrics for user review`);
    } catch (error) {
      console.error('Error saving pending metrics:', error);
    }
  }

  getAffectedSystems(userId, metrics) {
    const affectedSystems = new Set();
    for (const metric of metrics) {
      const systemId = healthSystemsService.mapMetricToSystem(metric.name, metric.category);
      if (systemId) {
        affectedSystems.add(systemId);
      }
    }
    console.log(`[AFFECTED SYSTEMS] userId=${userId} systems=[${Array.from(affectedSystems)}]`);
    return affectedSystems;
  }
}

module.exports = new IngestionService();
