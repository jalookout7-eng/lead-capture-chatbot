require('dotenv').config();
const { createClient } = require('@libsql/client');

const NOTIFICATION_CONFIG_DEFAULTS = [
  { key: 'resend_api_key', value: '' },
  { key: 'resend_from_address', value: 'john.alexander@3dvisualpro.com' },
  { key: 'notify_team_email', value: 'true' },
  { key: 'notify_lead_confirmation', value: 'true' },
  { key: 'lead_confirmation_subject', value: 'We got your message, {{name}}' },
  { key: 'lead_confirmation_body', value: '<p>Hi {{name}},</p>\n<p>Thanks for chatting with Aria. We’ve received your details and one of our team will be in touch within 24 hours.</p>\n<p>— John Alexander<br>3D Visual Pro</p>' },
  { key: 'vapid_public_key', value: '' },
  { key: 'vapid_private_key', value: '' }
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

  console.log('[migrate-v4] Connected to Turso.');

  // Step 1: push_subscriptions table
  await client.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id            TEXT PRIMARY KEY,
      endpoint      TEXT UNIQUE NOT NULL,
      p256dh_key    TEXT NOT NULL,
      auth_key      TEXT NOT NULL,
      user_agent    TEXT,
      created_at    TEXT NOT NULL,
      last_used_at  TEXT
    )
  `);
  console.log('[migrate-v4] push_subscriptions table ready.');

  // Step 2: scraper_config table (shared with Sub-project C; safe if it already exists)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS scraper_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  console.log('[migrate-v4] scraper_config table ready.');

  // Step 3: Seed notification config keys (INSERT OR IGNORE so re-running and Sub-project C overlap are safe)
  const now = new Date().toISOString();
  for (const { key, value } of NOTIFICATION_CONFIG_DEFAULTS) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO scraper_config (key, value, updated_at) VALUES (?, ?, ?)',
      args: [key, value, now]
    });
  }
  console.log(`[migrate-v4] Seeded ${NOTIFICATION_CONFIG_DEFAULTS.length} notification config keys (existing skipped).`);

  console.log('[migrate-v4] Migration complete.');
}

run().catch(err => {
  console.error('[migrate-v4] FAILED:', err);
  process.exit(1);
});
