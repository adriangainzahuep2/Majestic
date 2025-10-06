'use strict';

try { require('dotenv').config(); } catch (_) {}

const { pool } = require('../database/schema');

function parseArgs(argv) {
  const args = { userId: 2 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--userId') args.userId = parseInt(argv[++i], 10);
  }
  return args;
}

(async () => {
  const { userId } = parseArgs(process.argv);
  const pendingQ = `SELECT COUNT(*)::int AS c FROM pending_metric_suggestions WHERE user_id=$1 AND status='pending'`;
  const metricsQ = `SELECT COUNT(*)::int AS c FROM metrics WHERE user_id=$1`;
  const aiQ = `SELECT output_type, system_id, created_at FROM ai_outputs_log WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`;

  const [pending, metrics, ai] = await Promise.all([
    pool.query(pendingQ, [userId]),
    pool.query(metricsQ, [userId]),
    pool.query(aiQ, [userId])
  ]);

  console.log(JSON.stringify({
    userId,
    pending: pending.rows[0].c,
    metrics: metrics.rows[0].c,
    last_ai: ai.rows
  }, null, 2));

  await pool.end();
})().catch(err => { console.error(err.message); process.exit(1); });


