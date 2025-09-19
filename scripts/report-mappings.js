'use strict';

try { require('dotenv').config(); } catch (_) {}

const { pool } = require('../database/schema');

function ensureArrayMaybeJson(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return []; }
}

function pickTopSuggestion(block, originalName) {
  if (!block || !Array.isArray(block.suggestions)) return null;
  const entry = block.suggestions.find(s => s.original_name === originalName);
  if (!entry || !Array.isArray(entry.suggested_matches) || entry.suggested_matches.length === 0) return null;
  const sorted = [...entry.suggested_matches].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  return sorted[0];
}

(async () => {
  const userId = parseInt(process.argv[2], 10) || 2;

  // Latest upload for this user
  const up = await pool.query(`
    SELECT id, filename, created_at
    FROM uploads
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId]);

  if (up.rows.length === 0) {
    console.log(JSON.stringify({ error: 'no_uploads' }));
    await pool.end();
    return;
  }

  const upload = up.rows[0];

  // Fetch the suggestion row (processed or pending) for that upload
  const sug = await pool.query(`
    SELECT id, status, unmatched_metrics, ai_suggestions, test_date, created_at
    FROM pending_metric_suggestions
    WHERE user_id = $1 AND upload_id = $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId, upload.id]);

  let mapping = [];
  if (sug.rows.length > 0) {
    const row = sug.rows[0];
    const unmatched = ensureArrayMaybeJson(row.unmatched_metrics);
    const suggestions = typeof row.ai_suggestions === 'string' ? (()=>{try{return JSON.parse(row.ai_suggestions)}catch{return null}})() : row.ai_suggestions;
    for (const m of unmatched) {
      const best = pickTopSuggestion(suggestions, m.name);
      mapping.push({ original: m.name, approved: best?.standard_name || null, value: m.value, unit: m.unit });
    }
  }

  // Metrics inserted for that upload
  const mets = await pool.query(`
    SELECT metric_name, metric_value, metric_unit
    FROM metrics
    WHERE user_id = $1 AND upload_id = $2
    ORDER BY metric_name
  `, [userId, upload.id]);

  console.log(JSON.stringify({
    userId,
    upload,
    mapping_from_ai: mapping,
    metrics_inserted: mets.rows
  }, null, 2));

  await pool.end();
})().catch(err => { console.error(err.message); process.exit(1); });


