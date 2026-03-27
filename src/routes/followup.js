const express = require('express');
const { getClient } = require('../db/client');
const { qualifyLead } = require('../services/qualifier');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/followup/:id — regenerate follow-up message
router.post('/:id', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const session = await client.execute({
      sql: 'SELECT messages FROM chat_sessions WHERE lead_id = ?',
      args: [req.params.id]
    });
    const messages = session.rows.length ? JSON.parse(session.rows[0].messages) : [];

    const { followup } = await qualifyLead(messages);

    await client.execute({
      sql: 'UPDATE leads SET followup = ? WHERE id = ?',
      args: [followup, req.params.id]
    });

    res.json({ followup });
  } catch (err) {
    console.error('Regenerate followup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/followup/:id — edit followup text or mark as sent
router.patch('/:id', requireAuth, async (req, res) => {
  const { followup, sent } = req.body;
  try {
    const client = getClient();

    if (followup !== undefined) {
      await client.execute({
        sql: 'UPDATE leads SET followup = ? WHERE id = ?',
        args: [followup, req.params.id]
      });
    }
    if (sent !== undefined) {
      await client.execute({
        sql: 'UPDATE leads SET followup_sent = ? WHERE id = ?',
        args: [sent ? 1 : 0, req.params.id]
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update followup error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
