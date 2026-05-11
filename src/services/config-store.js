const { getClient } = require('../db/client');

/**
 * Read all rows from scraper_config and return as a plain object { key: value }.
 * Missing rows are simply absent — caller is responsible for defaulting.
 */
async function loadAllConfig() {
  const client = getClient();
  const result = await client.execute('SELECT key, value FROM scraper_config');
  const config = {};
  result.rows.forEach(row => { config[row.key] = row.value; });
  return config;
}

/**
 * Read a single config value. Returns null if not set.
 */
async function getConfig(key) {
  const client = getClient();
  const result = await client.execute({
    sql: 'SELECT value FROM scraper_config WHERE key = ?',
    args: [key]
  });
  return result.rows[0]?.value ?? null;
}

/**
 * Upsert a single config value.
 */
async function setConfig(key, value) {
  const client = getClient();
  const now = new Date().toISOString();
  await client.execute({
    sql: 'INSERT INTO scraper_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    args: [key, value, now]
  });
}

module.exports = { loadAllConfig, getConfig, setConfig };
