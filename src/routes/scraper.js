const express = require('express');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { loadAllConfig, setConfig } = require('../services/config-store');
const { getClient } = require('../db/client');
const { searchBusinesses, getPlaceDetails, isMobileNumber } = require('../services/scraper');

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

router.post('/scraper/run-chunk', requireAuth, async (req, res) => {
  const { city, country, category } = req.body || {};
  if (!city || !country || !category) {
    return res.status(400).json({ error: 'city, country, and category are required' });
  }

  try {
    const all = await loadAllConfig();
    const apiKey = all.api_key;
    if (!apiKey) {
      return res.status(400).json({ error: 'api_key is not configured. Set it in the Scraper config panel.' });
    }
    const maxPerCategory = parseInt(all.max_per_category || '3', 10);
    const preferMobile = (all.prefer_mobile || 'true') === 'true';

    let searchResults;
    try {
      searchResults = await searchBusinesses(apiKey, city, category);
    } catch (err) {
      console.error('Google Places search error:', err.message);
      return res.status(503).json({ error: 'Google Places API error', detail: err.message });
    }

    const client = getClient();
    const inserted = [];
    let skipped = 0;

    for (const summary of searchResults) {
      if (inserted.length >= maxPerCategory) break;

      let details;
      try {
        details = await getPlaceDetails(apiKey, summary.place_id);
      } catch (err) {
        console.error('Place details error for', summary.place_id, err.message);
        continue;
      }

      if (preferMobile && !isMobileNumber(details.phone)) {
        skipped++;
        continue;
      }

      const existing = await client.execute({
        sql: 'SELECT id FROM scraped_leads WHERE place_id = ?',
        args: [details.placeId]
      });
      if (existing.rows.length) {
        skipped++;
        continue;
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      await client.execute({
        sql: `INSERT INTO scraped_leads
              (id, place_id, name, category, city, country, address, phone, website, google_rating, total_reviews, google_maps_url, status, transferred, scraped_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', 0, ?)`,
        args: [
          id, details.placeId, details.name, category, city, country,
          details.address, details.phone, details.website,
          details.rating, details.totalReviews, details.mapsUrl, now
        ]
      });

      inserted.push({
        id,
        name: details.name,
        city,
        phone: details.phone,
        website: details.website,
        google_rating: details.rating
      });
    }

    res.json({ inserted: inserted.length, skipped, leads: inserted });
  } catch (err) {
    console.error('Scraper run-chunk error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const VALID_SCRAPED_STATUSES = ['New', 'Called – No Answer', 'Called – Spoke', 'Interested', 'Not Interested'];

router.get('/scraper/leads', requireAuth, async (req, res) => {
  try {
    const where = ['transferred = 0'];
    const args = [];
    if (req.query.status)   { where.push('status = ?');   args.push(req.query.status); }
    if (req.query.category) { where.push('category = ?'); args.push(req.query.category); }
    if (req.query.country)  { where.push('country = ?');  args.push(req.query.country); }
    const sql = `SELECT * FROM scraped_leads WHERE ${where.join(' AND ')} ORDER BY scraped_at DESC`;
    const result = await getClient().execute({ sql, args });
    res.json({ leads: result.rows });
  } catch (err) {
    console.error('Scraper leads GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/scraper/leads/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!VALID_SCRAPED_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_SCRAPED_STATUSES.join(', ')}` });
  }
  try {
    const result = await getClient().execute({
      sql: 'UPDATE scraped_leads SET status = ? WHERE id = ?',
      args: [status, req.params.id]
    });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Scraped lead not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Scraper leads status PATCH error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
