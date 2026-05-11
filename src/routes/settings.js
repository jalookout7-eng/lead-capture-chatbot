const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { loadAllConfig, setConfig } = require('../services/config-store');

const router = express.Router();

// GET /api/settings/pipeline-statuses
// Optional query: ?include=all (include disabled rows; default returns enabled only? See below).
// Spec: admin UI needs ALL rows to render the toggle list. Lead-row dropdowns filter client-side.
router.get('/settings/pipeline-statuses', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const result = await client.execute(
      'SELECT id, label, created_at, enabled FROM pipeline_status_options ORDER BY created_at ASC'
    );
    // Coerce enabled to boolean for JSON (libsql returns INTEGER)
    const statuses = result.rows.map(r => ({
      id: r.id,
      label: r.label,
      created_at: r.created_at,
      enabled: r.enabled === undefined || r.enabled === null ? true : !!r.enabled
    }));
    res.json({ statuses });
  } catch (err) {
    console.error('List statuses error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/settings/pipeline-statuses
router.post('/settings/pipeline-statuses', requireAuth, async (req, res) => {
  const label = typeof req.body.label === 'string' ? req.body.label.trim() : '';
  if (!label) {
    return res.status(400).json({ error: 'label is required' });
  }
  try {
    const client = getClient();
    const id = randomUUID();
    const created_at = new Date().toISOString();
    await client.execute({
      sql: 'INSERT INTO pipeline_status_options (id, label, created_at, enabled) VALUES (?, ?, ?, 1)',
      args: [id, label, created_at]
    });
    res.status(201).json({ status: { id, label, created_at, enabled: true } });
  } catch (err) {
    if (/UNIQUE/i.test(err.message)) {
      return res.status(409).json({ error: 'Label already exists' });
    }
    console.error('Create status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/settings/pipeline-statuses/:id — toggle enabled flag (admin)
router.patch('/settings/pipeline-statuses/:id', requireAuth, async (req, res) => {
  if (typeof req.body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }
  try {
    const client = getClient();
    const result = await client.execute({
      sql: 'UPDATE pipeline_status_options SET enabled = ? WHERE id = ?',
      args: [req.body.enabled ? 1 : 0, req.params.id]
    });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Toggle status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/settings/pipeline-statuses/:id
router.delete('/settings/pipeline-statuses/:id', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const result = await client.execute({
      sql: 'DELETE FROM pipeline_status_options WHERE id = ?',
      args: [req.params.id]
    });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/settings/notifications — returns masked notification config
router.get('/settings/notifications', requireAuth, async (req, res) => {
  try {
    const config = await loadAllConfig();
    res.json({
      config: {
        resend_api_key_set: Boolean(config.resend_api_key && config.resend_api_key.length > 0),
        resend_from_address: config.resend_from_address || '',
        notification_recipient: config.notification_recipient || '',
        notify_team_email: config.notify_team_email === 'true',
        notify_lead_confirmation: config.notify_lead_confirmation === 'true',
        lead_confirmation_subject: config.lead_confirmation_subject || '',
        lead_confirmation_body: config.lead_confirmation_body || ''
      }
    });
  } catch (err) {
    console.error('Get notifications settings error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/settings/notifications — upsert any subset of allowed keys
router.patch('/settings/notifications', requireAuth, async (req, res) => {
  const ALLOWED_BOOL = ['notify_team_email', 'notify_lead_confirmation'];
  const ALLOWED_STR = ['resend_api_key', 'resend_from_address', 'notification_recipient', 'lead_confirmation_subject', 'lead_confirmation_body'];

  const body = req.body || {};

  // Guard: resend_api_key cannot be explicitly cleared (must either omit or provide a real key)
  if (Object.prototype.hasOwnProperty.call(body, 'resend_api_key') && body.resend_api_key === '') {
    return res.status(400).json({ error: 'resend_api_key cannot be empty; omit to leave unchanged' });
  }

  try {
    for (const key of ALLOWED_BOOL) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        await setConfig(key, body[key] ? 'true' : 'false');
      }
    }
    for (const key of ALLOWED_STR) {
      if (Object.prototype.hasOwnProperty.call(body, key) && typeof body[key] === 'string') {
        await setConfig(key, body[key]);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update notifications settings error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
