const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loadAllConfig, setConfig } = require('../services/config-store');

const router = express.Router();

const SCRAPER_CONFIG_KEYS = ['api_key', 'categories', 'cities', 'max_leads_per_run', 'max_per_category', 'prefer_mobile'];
const JSON_KEYS = new Set(['categories', 'cities']);

function parseValue(key, raw) {
  if (raw == null) return null;
  if (JSON_KEYS.has(key)) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function serializeValue(key, value) {
  if (JSON_KEYS.has(key)) return JSON.stringify(value);
  return String(value);
}

router.get('/scraper/config', requireAuth, async (req, res) => {
  try {
    const all = await loadAllConfig();
    const config = {};
    for (const key of SCRAPER_CONFIG_KEYS) {
      const raw = all[key] ?? '';
      if (key === 'api_key') {
        config[key] = raw ? '●●●●●' : '';
      } else {
        config[key] = parseValue(key, raw);
      }
    }
    res.json({ config });
  } catch (err) {
    console.error('Scraper config GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/scraper/config', requireAuth, async (req, res) => {
  const body = req.body || {};
  if ('api_key' in body && body.api_key === '') {
    return res.status(400).json({ error: 'api_key cannot be set to an empty string. Omit the key to leave unchanged.' });
  }
  try {
    for (const key of SCRAPER_CONFIG_KEYS) {
      if (!(key in body)) continue;
      await setConfig(key, serializeValue(key, body[key]));
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Scraper config PATCH error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
