require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { createClient } = require('@libsql/client');

const DEFAULT_SCORING_RULES = {
  weights: {
    budget_mentioned: 10,
    specific_pain_point: 8,
    decision_maker_present: 12,
    specific_timeline: 8,
    asking_about_pricing: 5,
    ready_to_start_immediately: 15,
    no_budget_context: -5,
    just_browsing: -10
  },
  thresholds: { hot: 25, warm: 10 },
  signals: {
    hot_signals: ['mentions specific budget', 'deadline within 90 days', 'ready to start'],
    warm_signals: ['engaged and asking questions', 'exploring options', 'comparing vendors'],
    cold_signals: ['no budget context', 'no timeline given', 'vague need']
  }
};

async function run() {
  if (!process.env.TURSO_URL || !process.env.TURSO_TOKEN) {
    console.error('Missing TURSO_URL or TURSO_TOKEN environment variable.');
    process.exit(1);
  }

  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN
  });

  console.log('[migrate-v7] Connected to Turso.');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS intelligence_versions (
      id              TEXT PRIMARY KEY,
      version_number  INTEGER NOT NULL,
      lessons_learned TEXT NOT NULL,
      scoring_rules   TEXT NOT NULL,
      changelog       TEXT NOT NULL,
      core_hash       TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      source          TEXT NOT NULL DEFAULT 'workspace',
      created_at      TEXT NOT NULL,
      published_at    TEXT,
      published_by    TEXT,
      archived_at     TEXT
    )
  `);
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_intelligence_active
      ON intelligence_versions(status) WHERE status = 'active'
  `);
  console.log('[migrate-v7] intelligence_versions table + partial unique index ready.');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS lead_tags (
      id         TEXT PRIMARY KEY,
      lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      tag_type   TEXT NOT NULL,
      reason     TEXT NOT NULL,
      tagged_at  TEXT NOT NULL
    )
  `);
  await client.execute('CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id ON lead_tags(lead_id)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_lead_tags_type    ON lead_tags(tag_type)');
  console.log('[migrate-v7] lead_tags table + indexes ready.');

  try {
    await client.execute('ALTER TABLE leads ADD COLUMN signals_observed TEXT DEFAULT NULL');
    console.log('[migrate-v7] leads.signals_observed column added.');
  } catch (err) {
    if (/duplicate column/i.test(err.message)) {
      console.log('[migrate-v7] leads.signals_observed already exists, skipping.');
    } else {
      throw err;
    }
  }

  // Seed v1 if not present
  const existing = await client.execute({
    sql: 'SELECT id FROM intelligence_versions WHERE version_number = 1',
    args: []
  });
  if (existing.rows.length) {
    console.log('[migrate-v7] v1 already seeded, skipping.');
  } else {
    const corePath = path.join(__dirname, '..', 'src', 'services', 'aria-core-prompt.md');
    const coreContent = fs.readFileSync(corePath, 'utf8');
    const coreHash = crypto.createHash('sha256').update(coreContent).digest('hex');
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO intelligence_versions
            (id, version_number, lessons_learned, scoring_rules, changelog, core_hash, status, source, created_at, published_at, published_by)
            VALUES (?, 1, '', ?, 'Initial seed version derived from hardcoded qualifier rubric.', ?, 'active', 'seed', ?, ?, 'migration')`,
      args: [randomUUID(), JSON.stringify(DEFAULT_SCORING_RULES), coreHash, now, now]
    });
    console.log('[migrate-v7] Seeded v1 active version with core_hash.');
  }

  console.log('[migrate-v7] Migration complete.');
}

run().catch(err => {
  console.error('[migrate-v7] FAILED:', err);
  process.exit(1);
});
