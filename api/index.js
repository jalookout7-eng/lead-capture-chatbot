const { initDb } = require('../src/db/client');
const app = require('../src/server');

// Initialize DB schema on cold start (idempotent — safe to run multiple times)
let _ready;
function ensureReady() {
  if (!_ready) _ready = initDb().catch(console.error);
  return _ready;
}

module.exports = async (req, res) => {
  await ensureReady();
  app(req, res);
};
