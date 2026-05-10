const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/leads/:id/notes — list all notes for a lead, newest first
router.get('/leads/:id/notes', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const lead = await client.execute({
      sql: 'SELECT id FROM leads WHERE id = ?',
      args: [req.params.id]
    });
    if (!lead.rows.length) return res.status(404).json({ error: 'Lead not found' });

    const notes = await client.execute({
      sql: 'SELECT id, lead_id, content, created_at FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC',
      args: [req.params.id]
    });
    res.json({ notes: notes.rows });
  } catch (err) {
    console.error('List notes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads/:id/notes — append a note
router.post('/leads/:id/notes', requireAuth, async (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }
  try {
    const client = getClient();
    const lead = await client.execute({
      sql: 'SELECT id FROM leads WHERE id = ?',
      args: [req.params.id]
    });
    if (!lead.rows.length) return res.status(404).json({ error: 'Lead not found' });

    const id = randomUUID();
    const created_at = new Date().toISOString();
    await client.execute({
      sql: 'INSERT INTO lead_notes (id, lead_id, content, created_at) VALUES (?, ?, ?, ?)',
      args: [id, req.params.id, content, created_at]
    });
    res.status(201).json({ note: { id, lead_id: req.params.id, content, created_at } });
  } catch (err) {
    console.error('Create note error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
