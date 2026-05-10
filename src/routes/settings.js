const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/settings/pipeline-statuses
router.get('/settings/pipeline-statuses', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const result = await client.execute(
      'SELECT id, label, created_at FROM pipeline_status_options ORDER BY created_at ASC'
    );
    res.json({ statuses: result.rows });
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
      sql: 'INSERT INTO pipeline_status_options (id, label, created_at) VALUES (?, ?, ?)',
      args: [id, label, created_at]
    });
    res.status(201).json({ status: { id, label, created_at } });
  } catch (err) {
    if (/UNIQUE/i.test(err.message)) {
      return res.status(409).json({ error: 'Label already exists' });
    }
    console.error('Create status error:', err);
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

module.exports = router;
