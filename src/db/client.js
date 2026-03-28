const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

let _client;

function getClient() {
  if (!_client) {
    if (!process.env.TURSO_URL || !process.env.TURSO_TOKEN) {
      throw new Error('Missing required environment variables: TURSO_URL and TURSO_TOKEN');
    }
    _client = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_TOKEN,
    });
  }
  return _client;
}

async function initDb() {
  const client = getClient();
  const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  );
  // Execute each statement separately
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }

  // Add new columns for v2 (safe to re-run — ignores if column exists)
  const alterStatements = [
    'ALTER TABLE leads ADD COLUMN phone TEXT',
    'ALTER TABLE leads ADD COLUMN notes TEXT',
  ];
  for (const stmt of alterStatements) {
    try {
      await client.execute(stmt);
    } catch (err) {
      // Column already exists — safe to ignore
    }
  }
}

module.exports = { getClient, initDb };
