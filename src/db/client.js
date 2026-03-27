const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

let _client;

function getClient() {
  if (!_client) {
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
}

module.exports = { getClient, initDb };
