'use strict';

// Auto-approve pending metric suggestions by choosing the top AI suggestion per metric

try { require('dotenv').config(); } catch (_) {}

const { pool } = require('../database/schema');
const catalog = require('../shared/metricsCatalog');
const healthSystemsService = require('../services/healthSystems');

function parseArgs(argv) {
  const args = { userId: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--userId') args.userId = parseInt(argv[++i], 10);
  }
  return args;
}

function ensureArrayMaybeJson(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return []; }
}

function pickBestSuggestionFor(originalName, suggestionsBlock) {
  if (!suggestionsBlock || !Array.isArray(suggestionsBlock.suggestions)) return null;
  const entry = suggestionsBlock.suggestions.find(s => s.original_name === originalName);
  if (!entry || !Array.isArray(entry.suggested_matches) || entry.suggested_matches.length === 0) return null;
  const sorted = [...entry.suggested_matches].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  return sorted[0];
}

async function approvePendingForUser(userId) {
  const pendingRes = await pool.query(`
    SELECT id, user_id, upload_id, unmatched_metrics, ai_suggestions, test_date
    FROM pending_metric_suggestions
    WHERE user_id = $1 AND status = 'pending'
    ORDER BY created_at DESC
  `, [userId]);

  let approvedCount = 0;
  let rowsProcessed = 0;

  for (const row of pendingRes.rows) {
    const suggestionId = row.id;
    const uploadId = row.upload_id;
    const testDate = row.test_date;
    const unmatched = ensureArrayMaybeJson(row.unmatched_metrics);
    const aiSuggestions = typeof row.ai_suggestions === 'string' ? (() => { try { return JSON.parse(row.ai_suggestions); } catch { return null; } })() : row.ai_suggestions;

    for (const m of unmatched) {
      const originalName = m.name;
      const best = pickBestSuggestionFor(originalName, aiSuggestions);
      if (!best || !best.standard_name) continue;

      const standardName = best.standard_name;
      const systemId = healthSystemsService.mapMetricToSystem(standardName, m.category);
      const isKey = healthSystemsService.isKeyMetric(systemId, standardName);
      const range = catalog.getRangeForName(standardName);
      const referenceRange = (range && range.min !== undefined && range.max !== undefined)
        ? `${range.min}-${range.max}`
        : (m.reference_range || null);

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
        systemId,
        standardName,
        m.value,
        m.unit,
        referenceRange,
        isKey,
        testDate
      ]);
      approvedCount += 1;
    }

    await pool.query(`
      UPDATE pending_metric_suggestions
      SET status = 'processed', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [suggestionId]);
    rowsProcessed += 1;
  }

  return { approvedCount, rowsProcessed };
}

async function main() {
  const args = parseArgs(process.argv);
  const userId = args.userId || 2;
  const { approvedCount, rowsProcessed } = await approvePendingForUser(userId);
  console.log(JSON.stringify({ userId, rowsProcessed, approvedCount }, null, 2));
}

main().catch((err) => {
  console.error('❌ Auto-approve failed:', err.message);
  process.exit(1);
});


