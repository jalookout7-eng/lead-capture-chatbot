require('dotenv').config();
const { createClient } = require('@libsql/client');

const DEFAULT_CATEGORIES = [
  'salon', 'spa', 'dental clinic', 'medical clinic', 'gym', 'fitness centre',
  'restaurant', 'cafe', 'hotel', 'real estate agency', 'law firm',
  'accounting firm', 'driving school', 'pet grooming', 'photography studio',
  'event venue', 'auto repair', 'travel agency'
];

const DEFAULT_CITIES = {
  Indonesia: [
    'Jakarta', 'Surabaya', 'Bandung', 'Medan',
    'Semarang', 'Makassar', 'Bali', 'Yogyakarta'
  ]
};

const SCRAPER_CONFIG_DEFAULTS = [
  { key: 'api_key', value: '' },
  { key: 'categories', value: JSON.stringify(DEFAULT_CATEGORIES) },
  { key: 'cities', value: JSON.stringify(DEFAULT_CITIES) },
  { key: 'max_leads_per_run', value: '15' },
  { key: 'max_per_category', value: '3' },
  { key: 'prefer_mobile', value: 'true' }
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

  console.log('[migrate-v6] Connected to Turso.');

  await client.execute(`
    CREATE TABLE IF NOT EXISTS scraped_leads (
      id                  TEXT PRIMARY KEY,
      place_id            TEXT UNIQUE NOT NULL,
      name                TEXT NOT NULL,
      category            TEXT,
      city                TEXT,
      country             TEXT,
      address             TEXT,
      phone               TEXT,
      website             TEXT,
      google_rating       REAL,
      total_reviews       INTEGER,
      google_maps_url     TEXT,
      status              TEXT NOT NULL DEFAULT 'New',
      transferred         INTEGER NOT NULL DEFAULT 0,
      transferred_lead_id TEXT,
      scraped_at          TEXT NOT NULL
    )
  `);
  console.log('[migrate-v6] scraped_leads table ready.');

  await client.execute('CREATE INDEX IF NOT EXISTS idx_scraped_leads_status   ON scraped_leads(status)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_scraped_leads_place_id ON scraped_leads(place_id)');
  console.log('[migrate-v6] scraped_leads indexes ready.');

  // scraper_config table already exists (created by migrate-v4); CREATE IF NOT EXISTS for safety.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS scraper_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  try {
    await client.execute('ALTER TABLE leads ADD COLUMN website TEXT DEFAULT NULL');
    console.log('[migrate-v6] leads.website column added.');
  } catch (err) {
    if (/duplicate column/i.test(err.message)) {
      console.log('[migrate-v6] leads.website column already exists, skipping.');
    } else {
      throw err;
    }
  }

  const now = new Date().toISOString();
  for (const { key, value } of SCRAPER_CONFIG_DEFAULTS) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO scraper_config (key, value, updated_at) VALUES (?, ?, ?)',
      args: [key, value, now]
    });
  }
  console.log(`[migrate-v6] Seeded ${SCRAPER_CONFIG_DEFAULTS.length} scraper config keys (existing skipped).`);

  console.log('[migrate-v6] Migration complete.');
}

run().catch(err => {
  console.error('[migrate-v6] FAILED:', err);
  process.exit(1);
});
