const { Pool } = require('pg');
const path = require('path');
const fs = require('fs').promises;
const healthSystemsService = require('./healthSystems');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

class IngestionService {
  constructor() {
    this.openaiService = require('./openai');
    this.visualStudyService = require('./visualStudyService');
    this.thumbnailService = require('./thumbnailService');
  }

  async processFile({ userId, file, testDate }) {
    try {
      console.log(`[PIPELINE] Processing file: ${file.originalname}`);

      // Step 1: Classify the file
      const classification = await this.classifyFile(file);
      console.log(`[CLASSIFICATION] File type: ${classification.dataType}, Study: ${classification.studyType}`);

      // Step 2: Route based on classification
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
      
      // Quick classification for known DICOM files
      if (fileExtension === '.dcm' || fileExtension === '.dicom' || 
          file.mimetype.includes('dicom')) {
        return {
          dataType: 'visual',
          studyType: 'unknown', // Will be determined by GPT-4o if processed
          linkedSystemId: null
        };
      }

      // Use GPT-4o for classification
      const classificationPrompt = `
        Classify this medical file based on its filename and content.
        
        Filename: ${file.originalname}
        File type: ${file.mimetype}
        
        Determine:
        1. dataType: "lab" (numeric lab results), "visual" (imaging/visual studies), or "mixed" (contains both)
        2. studyType: one of "eye_topography", "oct", "fundus", "mri", "ct", "xray", "dexa", "ecg", "eeg", "unknown"
        3. linkedSystemId: which body system this belongs to (1-13)
        
        Body Systems:
        1: Cardiovascular, 2: Nervous/Brain, 3: Respiratory, 4: Muscular, 5: Skeletal
        6: Digestive, 7: Endocrine, 8: Urinary, 9: Reproductive, 10: Integumentary
        11: Immune/Inflammation, 12: Sensory, 13: Genetics & Biological Age
        
        Return JSON only:
        {
          "dataType": "lab|visual|mixed",
          "studyType": "study_type_or_unknown",
          "linkedSystemId": number_or_null
        }
      `;

      const response = await this.openaiService.generateCompletion(
        classificationPrompt,
        file.base64Data,
        file.originalname
      );

      // Clean the response and extract JSON
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\s*/, '').replace(/```$/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\s*/, '').replace(/```$/, '');
      }

      return JSON.parse(cleanResponse);

    } catch (error) {
      console.warn('[CLASSIFICATION] Failed, defaulting to lab processing:', error.message);
      return {
        dataType: 'lab',
        studyType: 'unknown',
        linkedSystemId: null
      };
    }
  }

  async processLabFile(userId, file, testDate) {
    console.log('[LAB] Processing lab file...');
    
    // Use existing lab processing pipeline
    const extractedData = await this.openaiService.processLabReport(
      file.base64Data, 
      file.originalname
    );

    // Save to uploads table
    const uploadResult = await pool.query(`
      INSERT INTO uploads (user_id, filename, file_type, file_size, upload_type, processing_status)
      VALUES ($1, $2, $3, $4, 'manual', 'completed')
      RETURNING id
    `, [userId, file.originalname, file.mimetype, file.size]);

    const uploadId = uploadResult.rows[0].id;

    // Save metrics if extracted
    if (extractedData.metrics) {
      await this.saveMetricsToDatabase(userId, uploadId, extractedData.metrics, testDate);
    }

    return {
      status: 'processed',
      dataType: 'lab',
      metricsCount: extractedData.metrics?.length || 0,
      message: `Processed ${extractedData.metrics?.length || 0} lab metrics`
    };
  }

  async processVisualFile(userId, file, testDate, classification) {
    console.log('[VISUAL] Processing visual study...');

    const fileExtension = path.extname(file.originalname).toLowerCase();

    // Handle DICOM files (store only, no processing in Phase 1)
    if (fileExtension === '.dcm' || fileExtension === '.dicom') {
      return await this.handleDicomFile(userId, file, testDate);
    }

    // Store file and generate thumbnail
    const fileUrl = await this.storeFile(file);
    const thumbnailUrl = await this.thumbnailService.generateThumbnail(fileUrl, fileExtension);

    // Extract study data using GPT-4o
    const studyData = await this.visualStudyService.extractStudyData(
      file.base64Data,
      file.originalname,
      classification.studyType
    );

    // Save to imaging_studies table
    const studyId = await this.saveImagingStudy({
      userId,
      fileUrl,
      thumbnailUrl,
      testDate: studyData.dateFoundInImage || testDate,
      studyType: studyData.studyType || classification.studyType,
      linkedSystemId: this.mapStudyTypeToSystem(studyData.studyType || classification.studyType),
      metricsJson: studyData.measurements || [],
      aiSummary: studyData.summary,
      status: 'processed'
    });

    // Generate comparison with previous studies
    await this.generateStudyComparison(studyId, userId, studyData.studyType);

    return {
      status: 'processed',
      dataType: 'visual',
      studyType: studyData.studyType,
      studyId,
      aiSummary: studyData.summary,
      metricsJson: studyData.measurements,
      message: `Visual study processed successfully`
    };
  }

  async processMixedFile(userId, file, testDate, classification) {
    console.log('[MIXED] Processing mixed file...');

    // Process both lab and visual components in parallel
    const [labResult, visualResult] = await Promise.allSettled([
      this.processLabFile(userId, file, testDate),
      this.processVisualFile(userId, file, testDate, classification)
    ]);

    return {
      status: 'processed',
      dataType: 'mixed',
      labProcessing: labResult.status === 'fulfilled' ? labResult.value : { error: labResult.reason?.message },
      visualProcessing: visualResult.status === 'fulfilled' ? visualResult.value : { error: visualResult.reason?.message },
      message: 'Mixed file processed with both lab and visual components'
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
      status: 'failedExtraction'
    });

    return {
      status: 'failedExtraction',
      dataType: 'visual',
      studyType: 'dicom',
      studyId,
      message: 'DICOM file stored but not processed in Phase 1'
    };
  }

  async storeFile(file) {
    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join('./uploads', fileName);
    await fs.writeFile(filePath, Buffer.from(file.base64Data, 'base64'));
    return filePath;
  }

  async saveImagingStudy(studyData) {
    const result = await pool.query(`
      INSERT INTO imaging_studies (
        user_id, linked_system_id, study_type, file_url, thumbnail_url,
        test_date, ai_summary, metrics_json, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      studyData.userId,
      studyData.linkedSystemId,
      studyData.studyType,
      studyData.fileUrl,
      studyData.thumbnailUrl,
      studyData.testDate,
      studyData.aiSummary,
      JSON.stringify(studyData.metricsJson),
      studyData.status
    ]);

    return result.rows[0].id;
  }

  async generateStudyComparison(currentStudyId, userId, studyType) {
    try {
      // Get previous studies of the same type
      const previousStudies = await pool.query(`
        SELECT * FROM imaging_studies 
        WHERE user_id = $1 AND study_type = $2 AND id != $3
        ORDER BY test_date DESC
        LIMIT 5
      `, [userId, studyType, currentStudyId]);

      if (previousStudies.rows.length === 0) {
        return; // No previous studies to compare
      }

      // Get current study
      const currentStudy = await pool.query(`
        SELECT * FROM imaging_studies WHERE id = $1
      `, [currentStudyId]);

      const current = currentStudy.rows[0];
      const previous = previousStudies.rows[0]; // Most recent

      // Generate comparison using AI
      const comparison = await this.visualStudyService.generateComparison(
        current,
        previous,
        previousStudies.rows
      );

      // Update current study with comparison
      await pool.query(`
        UPDATE imaging_studies 
        SET comparison_summary = $1, metric_changes_json = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [
        comparison.trendSummary,
        JSON.stringify(comparison.metricChanges),
        currentStudyId
      ]);

    } catch (error) {
      console.error('[COMPARISON] Failed to generate study comparison:', error);
    }
  }

  mapStudyTypeToSystem(studyType) {
    const mapping = {
      'eye_topography': 12, // Sensory
      'keratometry': 12,    // Sensory (same as eye_topography)
      'oct': 12,           // Sensory
      'fundus': 12,        // Sensory
      'mri': 2,            // Nervous/Brain
      'ct': 2,             // Nervous/Brain
      'xray': 5,           // Skeletal
      'dexa': 5,           // Skeletal
      'ecg': 1,            // Cardiovascular
      'eeg': 2,            // Nervous/Brain
      'unknown': null
    };

    console.log(`[MAPPING] studyType="${studyType}" -> systemId=${mapping[studyType] || null}`);
    return mapping[studyType] || null;
  }

  async saveMetricsToDatabase(userId, uploadId, metrics, testDate) {
    // Load reference metrics from admin spreadsheet
    const referenceMetrics = require('../public/data/metrics.json');
    
    for (const metric of metrics) {
      try {
        // Use existing shared mapper - it handles both metric name AND category
        const systemId = healthSystemsService.mapMetricToSystem(metric.name, metric.category);
        
        // Look up reference range and key metric status from admin spreadsheet
        const referenceData = referenceMetrics.find(ref => 
          ref.metric_name.toLowerCase() === metric.name.toLowerCase()
        );
        
        const referenceRange = referenceData ? 
          `${referenceData.min}-${referenceData.max}` : 
          metric.reference_range; // Fallback to OpenAI extracted range
          
        const isKeyMetric = referenceData ? referenceData.is_key_metric : false;
        
        await pool.query(`
          INSERT INTO metrics (user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, test_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (user_id, metric_name, test_date, upload_id) DO UPDATE SET
            metric_value = EXCLUDED.metric_value,
            metric_unit = EXCLUDED.metric_unit,
            reference_range = EXCLUDED.reference_range,
            is_key_metric = EXCLUDED.is_key_metric
        `, [
          userId,
          uploadId,
          systemId,                    // From shared mapper
          metric.name,
          metric.value,
          metric.unit,
          referenceRange,              // From admin spreadsheet
          isKeyMetric,                 // From admin spreadsheet
          testDate                     // From Add Data page input
        ]);
      } catch (error) {
        console.error('Error saving metric:', error);
      }
    }
  }
}

module.exports = new IngestionService();