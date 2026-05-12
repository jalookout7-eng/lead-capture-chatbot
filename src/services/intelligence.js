const { getClient } = require('../db/client');

const CACHE_TTL_MS = 60_000;
let cachedActive = null;
let cachedAt = 0;

async function getActiveIntelligenceVersion() {
  if (cachedActive && Date.now() - cachedAt < CACHE_TTL_MS) return cachedActive;
  const client = getClient();
  const result = await client.execute({
    sql: 'SELECT * FROM intelligence_versions WHERE status = ? LIMIT 1',
    args: ['active']
  });
  cachedActive = result.rows[0] || null;
  cachedAt = Date.now();
  return cachedActive;
}

function invalidateCache() {
  cachedActive = null;
  cachedAt = 0;
}

module.exports = { getActiveIntelligenceVersion, invalidateCache };
