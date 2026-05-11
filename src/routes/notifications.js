const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const { getConfig } = require('../services/config-store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/push/subscribe — upsert a push subscription
router.post('/push/subscribe', requireAuth, async (req, res) => {
  const { endpoint, keys, userAgent } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'endpoint is required' });
  }
  if (!keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'keys.p256dh and keys.auth are required' });
  }
  try {
    const client = getClient();
    const id = randomUUID();
    const now = new Date().toISOString();
    // Upsert by endpoint (UNIQUE constraint replaces an existing row)
    await client.execute({
      sql: `INSERT INTO push_subscriptions (id, endpoint, p256dh_key, auth_key, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(endpoint) DO UPDATE SET
              p256dh_key = excluded.p256dh_key,
              auth_key = excluded.auth_key,
              user_agent = excluded.user_agent`,
      args: [id, endpoint, keys.p256dh, keys.auth, userAgent || null, now]
    });
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/push/subscribe — remove a push subscription
router.delete('/push/subscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'endpoint is required' });
  }
  try {
    const client = getClient();
    await client.execute({
      sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
      args: [endpoint]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/push/vapid-key — public key only, no auth required
router.get('/push/vapid-key', async (req, res) => {
  try {
    const publicKey = await getConfig('vapid_public_key');
    if (!publicKey) {
      return res.status(503).json({ error: 'VAPID keys not yet generated' });
    }
    res.json({ publicKey });
  } catch (err) {
    console.error('VAPID key error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
