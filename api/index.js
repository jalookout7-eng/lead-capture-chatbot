const { initDb } = require('../src/db/client');
const app = require('../src/server');

// Initialize DB schema on cold start (idempotent — safe to run multiple times)
let _ready;
function ensureReady() {
  if (!_ready) _ready = initDb().catch(console.error);
  return _ready;
}

module.exports = async (req, res) => {
  // Allow cross-origin requests — widget is embedded on external WordPress sites
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle browser preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  await ensureReady();
  app(req, res);
};
