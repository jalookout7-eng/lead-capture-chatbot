require('dotenv').config();
const { createClient } = require('@libsql/client');

async function run() {
  if (!process.env.TURSO_URL || !process.env.TURSO_TOKEN) {
    console.error('Missing TURSO_URL or TURSO_TOKEN environment variable.');
    process.exit(1);
  }

  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN
  });

  console.log('[migrate-v5] Connected to Turso.');

  // Step 1: pipeline_status_options.enabled column (default 1 = enabled)
  try {
    await client.execute('ALTER TABLE pipeline_status_options ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
    console.log('[migrate-v5] pipeline_status_options.enabled column added.');
  } catch (err) {
    if (/duplicate column/i.test(err.message)) {
      console.log('[migrate-v5] pipeline_status_options.enabled column already exists, skipping.');
    } else {
      throw err;
    }
  }

  // Step 2: notification_recipient config key (defaults to empty; falls back to resend_from_address at runtime)
  const now = new Date().toISOString();
  await client.execute({
    sql: 'INSERT OR IGNORE INTO scraper_config (key, value, updated_at) VALUES (?, ?, ?)',
    args: ['notification_recipient', '', now]
  });
  console.log('[migrate-v5] notification_recipient config key seeded.');

  console.log('[migrate-v5] Migration complete.');
}

run().catch(err => {
  console.error('[migrate-v5] FAILED:', err);
  process.exit(1);
});
