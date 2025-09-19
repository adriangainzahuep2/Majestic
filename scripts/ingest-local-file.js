'use strict';

// Load environment variables early (OPENAI_API_KEY, DATABASE_URL, etc.)
try { require('dotenv').config(); } catch (_) {}

// Local ingestion runner: reads a file from disk and runs the unified pipeline

const fs = require('fs');
const path = require('path');
const { pool, initializeDatabase } = require('../database/schema');
const ingestionService = require('../services/ingestionService');

function parseArgs(argv) {
  const args = { email: 'demo@example.com', testDate: new Date().toISOString().slice(0, 10) };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i];
    else if (a === '--userId') args.userId = parseInt(argv[++i], 10);
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--testDate') args.testDate = argv[++i];
  }
  return args;
}

async function ensureUser({ userId, email }) {
  if (userId && Number.isFinite(userId)) {
    const r = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (r.rows.length) return userId;
  }
  const e = (email || 'demo@example.com').toLowerCase();
  const found = await pool.query('SELECT id FROM users WHERE email = $1', [e]);
  if (found.rows.length) return found.rows[0].id;
  const ins = await pool.query(
    `INSERT INTO users (email, name, avatar_url) VALUES ($1, $2, $3) RETURNING id`,
    [e, 'Demo User', null]
  );
  return ins.rows[0].id;
}

function detectMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Usage: node scripts/ingest-local-file.js --file "C:/path/to/report.pdf" [--email you@example.com] [--testDate YYYY-MM-DD]');
    process.exit(1);
  }

  // Initialize schema if needed
  await initializeDatabase().catch(() => {});

  const absPath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(absPath);
  const buffer = fs.readFileSync(absPath);
  const base64Data = buffer.toString('base64');
  const mimetype = detectMime(absPath);

  const userId = await ensureUser({ userId: args.userId, email: args.email });

  const file = {
    originalname: path.basename(absPath),
    mimetype,
    size: stat.size,
    path: absPath,
    base64Data
  };

  console.log(`[RUN] Ingesting file for userId=${userId} testDate=${args.testDate} file=${file.originalname}`);
  const t0 = Date.now();
  const result = await ingestionService.processFile({ userId, file, testDate: args.testDate });
  const ms = Date.now() - t0;

  console.log('=== Ingestion Result ===');
  console.log(JSON.stringify({ result, elapsed_ms: ms }, null, 2));

  // Show counts from DB
  try {
    const uploads = await pool.query('SELECT COUNT(*)::int AS c FROM uploads WHERE user_id = $1', [userId]);
    const metrics = await pool.query('SELECT COUNT(*)::int AS c FROM metrics WHERE user_id = $1', [userId]);
    const pending = await pool.query('SELECT COUNT(*)::int AS c FROM pending_metric_suggestions WHERE user_id = $1', [userId]);
    console.log('=== DB Summary ===');
    console.log({ uploads: uploads.rows[0].c, metrics: metrics.rows[0].c, pending_suggestions: pending.rows[0].c });
  } catch {}
}

main().catch((err) => {
  console.error('❌ Ingestion failed:', err.message);
  process.exit(1);
});



