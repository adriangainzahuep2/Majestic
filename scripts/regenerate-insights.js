'use strict';

try { require('dotenv').config(); } catch (_) {}

const { pool } = require('../database/schema');
const queueService = require('../services/queue');

function parseArgs(argv) {
  const args = { userId: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--userId') args.userId = parseInt(argv[++i], 10);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const userId = args.userId || 2;
  console.log(`[REGEN] Starting system insights regeneration for user ${userId}`);
  await queueService.regenerateSystemInsights(userId);
  console.log(`[REGEN] Completed for user ${userId}`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Regenerate failed:', err.message);
  process.exit(1);
});


