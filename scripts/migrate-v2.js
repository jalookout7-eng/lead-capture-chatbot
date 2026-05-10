require('dotenv').config();
const { createClient } = require('@libsql/client');
const { randomUUID } = require('crypto');

const DEFAULT_STATUSES = [
  'Contacted',
  'Dropped',
  'Email Sent',
  'WhatsApp Sent',
  'Meeting Done',
  'Negotiating',
  'Closed',
  'Lost'
];

async function run() {
  if (!process.env.TURSO_URL || !process.env.TURSO_TOKEN) {
    console.error('Missing TURSO_URL or TURSO_TOKEN environment variable.');
    process.exit(1);
  }

  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN
  });

  console.log('[migrate-v2] Connected to Turso.');

  // Step 1: lead_notes table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS lead_notes (
      id         TEXT PRIMARY KEY,
      lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  console.log('[migrate-v2] lead_notes table ready.');

  // Step 2: index on lead_notes.lead_id
  await client.execute('CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id)');
  console.log('[migrate-v2] idx_lead_notes_lead_id ready.');

  // Step 3: pipeline_status_options table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS pipeline_status_options (
      id         TEXT PRIMARY KEY,
      label      TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `);
  console.log('[migrate-v2] pipeline_status_options table ready.');

  // Step 4: leads.pipeline_status column (skip silently if exists)
  try {
    await client.execute('ALTER TABLE leads ADD COLUMN pipeline_status TEXT DEFAULT NULL');
    console.log('[migrate-v2] leads.pipeline_status column added.');
  } catch (err) {
    if (/duplicate column/i.test(err.message)) {
      console.log('[migrate-v2] leads.pipeline_status column already exists, skipping.');
    } else {
      throw err;
    }
  }

  // Step 5: seed default pipeline statuses (INSERT OR IGNORE on UNIQUE label)
  const now = new Date().toISOString();
  for (const label of DEFAULT_STATUSES) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO pipeline_status_options (id, label, created_at) VALUES (?, ?, ?)',
      args: [randomUUID(), label, now]
    });
  }
  console.log(`[migrate-v2] Seeded ${DEFAULT_STATUSES.length} default pipeline statuses (existing skipped).`);

  console.log('[migrate-v2] Migration complete.');
}

run().catch(err => {
  console.error('[migrate-v2] FAILED:', err);
  process.exit(1);
});
