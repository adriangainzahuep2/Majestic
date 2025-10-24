const openaiService = require('../services/openaiService');
const metricsCatalog = require('../shared/metricsCatalog');
const synonymService = require('../services/synonymService');

/**
 * Metric Suggestions Controller
 * Handles unmatched metrics with confidence-based auto-mapping
 * Implements: ≥95% confidence auto-map, ≤94% confidence manual review
 */

async function processUnmatchedMetrics(req, res) {
  try {
    const userId = req.user.id;
    const { uploadId, unmatchedMetrics, testDate } = req.body;

    if (!unmatchedMetrics || unmatchedMetrics.length === 0) {
      return res.json({
        success: true,
        autoMapped: [],
        needsReview: [],
        message: 'No unmatched metrics to process',
      });
    }

    console.log(`[Metric Suggestions] Processing ${unmatchedMetrics.length} unmatched metrics...`);

    const autoMapped = [];
    const needsReview = [];
    const aiSuggestions = [];

    for (const unmatchedMetric of unmatchedMetrics) {
      const { name, value, unit } = unmatchedMetric;
      const synonymMatch = await synonymService.findBestMatch(name);

      if (synonymMatch && synonymMatch.confidence >= 0.95) {
        console.log(`[Auto-Map] ${name} → ${synonymMatch.canonical_name} (${(synonymMatch.confidence * 100).toFixed(1)}%)`);
        try {
          await req.db.query(
            `INSERT INTO metrics (user_id, upload_id, system_id, metric_name, metric_value, metric_unit, test_date, is_adjusted, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false, CURRENT_TIMESTAMP)`,
            [userId, uploadId, synonymMatch.system_id, synonymMatch.canonical_name, parseFloat(value), unit || synonymMatch.canonical_unit, testDate || new Date()]
          );
          autoMapped.push({
            original_name: name,
            matched_name: synonymMatch.canonical_name,
            confidence: synonymMatch.confidence,
            value: value,
            unit: unit,
          });
          await logAutoMapping(req.db, userId, uploadId, name, synonymMatch);
        } catch (insertError) {
          console.error(`[Auto-Map Error] Failed to insert ${name}:`, insertError);
          needsReview.push({ original_name: name, value: value, unit: unit, error: 'Auto-map insertion failed' });
        }
      } else if (synonymMatch && synonymMatch.confidence >= 0.70) {
        console.log(`[Manual Review] ${name} → ${synonymMatch.canonical_name} (${(synonymMatch.confidence * 100).toFixed(1)}%)`);
        aiSuggestions.push({
          original_name: name,
          value: value,
          unit: unit,
          suggestions: [{
            metric_id: synonymMatch.metric_id,
            canonical_name: synonymMatch.canonical_name,
            system_id: synonymMatch.system_id,
            confidence: synonymMatch.confidence,
            reason: synonymMatch.reason || 'Synonym match',
          }],
        });
        needsReview.push({
          original_name: name,
          value: value,
          unit: unit,
          suggested_match: synonymMatch.canonical_name,
          confidence: synonymMatch.confidence,
        });
      } else {
        console.log(`[AI Analysis] ${name} - No good synonym match, requesting AI suggestions...`);
        try {
          const aiMatches = await getAISuggestions(name, value, unit);
          aiSuggestions.push({ original_name: name, value: value, unit: unit, suggestions: aiMatches });
          needsReview.push({ original_name: name, value: value, unit: unit, ai_suggestions: aiMatches });
        } catch (aiError) {
          console.error(`[AI Error] Failed to get suggestions for ${name}:`, aiError);
          needsReview.push({ original_name: name, value: value, unit: unit, error: 'AI analysis failed' });
        }
      }
    }

    if (needsReview.length > 0) {
      await req.db.query(
        `INSERT INTO pending_metric_suggestions (user_id, upload_id, unmatched_metrics, ai_suggestions, test_date, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT (user_id, upload_id) DO UPDATE SET
           unmatched_metrics = EXCLUDED.unmatched_metrics,
           ai_suggestions = EXCLUDED.ai_suggestions,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, uploadId, JSON.stringify(needsReview), JSON.stringify(aiSuggestions), testDate || new Date()]
      );
    }

    res.json({
      success: true,
      autoMapped: autoMapped,
      autoMappedCount: autoMapped.length,
      needsReview: needsReview,
      needsReviewCount: needsReview.length,
      message: `Auto-mapped ${autoMapped.length} metrics, ${needsReview.length} need review`,
    });
  } catch (error) {
    console.error('Process unmatched metrics error:', error);
    res.status(500).json({ success: false, error: 'Failed to process unmatched metrics', message: error.message });
  }
}

async function getPendingSuggestions(req, res) {
  try {
    const userId = req.user.id;
    const { uploadId } = req.query;
    let query = `SELECT pms.*, u.filename, u.created_at as upload_date
                 FROM pending_metric_suggestions pms
                 LEFT JOIN uploads u ON pms.upload_id = u.id
                 WHERE pms.user_id = $1 AND pms.status = 'pending'`;
    const params = [userId];

    if (uploadId) {
      query += ` AND pms.upload_id = $2`;
      params.push(uploadId);
    }

    query += ` ORDER BY pms.created_at DESC`;

    const result = await req.db.query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get pending suggestions error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve pending suggestions', message: error.message });
  }
}

async function approveSuggestions(req, res) {
  try {
    const userId = req.user.id;
    const { suggestionId } = req.params;
    const { approvedMappings } = req.body;

    if (!Array.isArray(approvedMappings) || approvedMappings.length === 0) {
      return res.status(400).json({ success: false, error: 'No mappings provided for approval' });
    }

    const suggestionResult = await req.db.query(
      'SELECT * FROM pending_metric_suggestions WHERE id = $1 AND user_id = $2',
      [suggestionId, userId]
    );

    if (suggestionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Suggestion not found' });
    }

    const suggestion = suggestionResult.rows[0];
    const insertedMetrics = [];

    for (const mapping of approvedMappings) {
      const { original_name, canonical_name, metric_id, value, unit } = mapping;
      try {
        const catalogMetric = metricsCatalog.findMetricById(metric_id);
        if (!catalogMetric) {
          console.warn(`[Approve Warning] Metric ${metric_id} not found in catalog`);
          continue;
        }

        const result = await req.db.query(
          `INSERT INTO metrics (user_id, upload_id, system_id, metric_name, metric_value, metric_unit, test_date, is_adjusted, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, CURRENT_TIMESTAMP)
           RETURNING *`,
          [userId, suggestion.upload_id, catalogMetric.system_id, canonical_name, parseFloat(value), unit || catalogMetric.canonical_unit, suggestion.test_date || new Date()]
        );
        insertedMetrics.push(result.rows[0]);
        await synonymService.addUserSynonym(userId, original_name, canonical_name, metric_id);
      } catch (insertError) {
        console.error(`[Approve Error] Failed to insert ${original_name}:`, insertError);
      }
    }

    await req.db.query(
      `UPDATE pending_metric_suggestions SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [suggestionId]
    );

    res.json({
      success: true,
      insertedMetrics: insertedMetrics,
      insertedCount: insertedMetrics.length,
      message: `Approved and inserted ${insertedMetrics.length} metrics`,
    });
  } catch (error) {
    console.error('Approve suggestions error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve suggestions', message: error.message });
  }
}

async function rejectSuggestions(req, res) {
  try {
    const userId = req.user.id;
    const { suggestionId } = req.params;
    const result = await req.db.query(
      `UPDATE pending_metric_suggestions SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING id`,
      [suggestionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Suggestion not found' });
    }

    res.json({ success: true, message: 'Suggestions rejected' });
  } catch (error) {
    console.error('Reject suggestions error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject suggestions', message: error.message });
  }
}

async function getAISuggestions(metricName, value, unit) {
  try {
    const allMetrics = metricsCatalog.getAllMetrics();
    const prompt = `Given a lab test metric "${metricName}" with value ${value} ${unit || ''},
      suggest the top 3 most likely matches from our catalog. Return as JSON array with fields:
      metric_id, canonical_name, confidence (0-1), reason.

      Available metrics:
      ${allMetrics.slice(0, 50).map((m) => `- ${m.metric_name} (${m.metric_id})`).join('\n')}`;
    const aiResponse = await openaiService.generateCompletion(prompt);
    const suggestions = JSON.parse(aiResponse);
    return suggestions.slice(0, 3);
  } catch (error) {
    console.error('Get AI suggestions error:', error);
    return [];
  }
}

async function logAutoMapping(db, userId, uploadId, originalName, matchInfo) {
  try {
    await db.query(
      `INSERT INTO ai_outputs_log (user_id, output_type, prompt, response, created_at)
       VALUES ($1, 'auto_mapping', $2, $3, CURRENT_TIMESTAMP)`,
      [userId, `Auto-mapped: ${originalName}`, JSON.stringify({
        original_name: originalName,
        matched_name: matchInfo.canonical_name,
        confidence: matchInfo.confidence,
        upload_id: uploadId,
      })]
    );
  } catch (error) {
    console.error('Log auto-mapping error:', error);
  }
}

module.exports = {
  processUnmatchedMetrics,
  getPendingSuggestions,
  approveSuggestions,
  rejectSuggestions,
};
