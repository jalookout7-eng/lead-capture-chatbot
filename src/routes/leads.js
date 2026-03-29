const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const { qualifyLead } = require('../services/qualifier');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/leads — capture lead and run AI qualification
router.post('/', async (req, res) => {
  const { sessionId, name, email, product, phone } = req.body;
  if (!sessionId || !name || !email || !product) {
    return res.status(400).json({ error: 'sessionId, name, email, and product are required' });
  }

  try {
    const client = getClient();
    const now = new Date().toISOString();
    const id = randomUUID();

    const sessionResult = await client.execute({
      sql: 'SELECT messages FROM chat_sessions WHERE id = ?',
      args: [sessionId]
    });
    const messages = sessionResult.rows.length
      ? JSON.parse(sessionResult.rows[0].messages)
      : [];

    const { summary, bottlenecks, score, followup } = await qualifyLead(messages);

    await client.execute({
      sql: `INSERT INTO leads (id, name, email, product, phone, summary, bottlenecks, score, followup, followup_sent, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'new', ?)`,
      args: [id, name, email, product, phone || null, summary, JSON.stringify(bottlenecks), score, followup, now]
    });

    await client.execute({
      sql: 'UPDATE chat_sessions SET lead_id = ? WHERE id = ?',
      args: [id, sessionId]
    });

    res.json({ id, score, followup });
  } catch (err) {
    console.error('Lead capture error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads/manual — manually add a lead (admin)
router.post('/manual', requireAuth, async (req, res) => {
  const { name, email, phone, product, score, notes } = req.body;
  const validProducts = ['ai_service', 'website', 'marketing', 'consultancy', 'other'];
  const validScores = ['hot', 'warm', 'cold'];

  if (!name || !email || !product || !score) {
    return res.status(400).json({ error: 'name, email, product, and score are required' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (!validProducts.includes(product)) {
    return res.status(400).json({ error: `product must be one of: ${validProducts.join(', ')}` });
  }
  if (!validScores.includes(score)) {
    return res.status(400).json({ error: `score must be one of: ${validScores.join(', ')}` });
  }

  try {
    const client = getClient();
    const id = randomUUID();
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO leads (id, name, email, product, phone, summary, bottlenecks, score, followup, followup_sent, notes, status, created_at)
            VALUES (?, ?, ?, ?, ?, '', '[]', ?, '', 0, ?, 'new', ?)`,
      args: [id, name, email, product, phone || null, score, notes || null, now]
    });
    res.json({ id, score });
  } catch (err) {
    console.error('Manual lead error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads/import — bulk import leads from Excel/CSV (admin)
router.post('/import', requireAuth, async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads)) {
    return res.status(400).json({ error: 'leads array is required' });
  }
  if (leads.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 leads per upload' });
  }

  const validProducts = ['ai_service', 'website', 'marketing', 'consultancy', 'other'];
  const validScores = ['hot', 'warm', 'cold'];
  const client = getClient();
  const now = new Date().toISOString();
  let imported = 0;
  const errors = [];

  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    if (!l.name || !l.email || !l.product || !l.score) {
      errors.push({ row: i + 1, reason: 'Missing required field (name, email, product, score)' });
      continue;
    }
    if (!l.email.includes('@')) {
      errors.push({ row: i + 1, reason: 'Invalid email format' });
      continue;
    }
    if (!validProducts.includes(l.product)) {
      errors.push({ row: i + 1, reason: `Invalid product: ${l.product}` });
      continue;
    }
    if (!validScores.includes(l.score)) {
      errors.push({ row: i + 1, reason: `Invalid score: ${l.score}` });
      continue;
    }

    try {
      const id = randomUUID();
      await client.execute({
        sql: `INSERT INTO leads (id, name, email, product, phone, summary, bottlenecks, score, followup, followup_sent, notes, status, created_at)
              VALUES (?, ?, ?, ?, ?, '', '[]', ?, '', 0, ?, 'new', ?)`,
        args: [id, l.name, l.email, l.product, l.phone || null, l.score, l.notes || null, now]
      });
      imported++;
    } catch (err) {
      errors.push({ row: i + 1, reason: 'Database error' });
    }
  }

  res.json({ imported, errors });
});

// GET /api/stats — dashboard stats (admin) — must be before /:id
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const total = await client.execute('SELECT COUNT(*) as count FROM leads');
    const hot = await client.execute("SELECT COUNT(*) as count FROM leads WHERE score = 'hot'");
    const warm = await client.execute("SELECT COUNT(*) as count FROM leads WHERE score = 'warm'");
    const cold = await client.execute("SELECT COUNT(*) as count FROM leads WHERE score = 'cold'");
    const byDay = await client.execute(
      "SELECT substr(created_at, 1, 10) as date, COUNT(*) as count FROM leads GROUP BY date ORDER BY date DESC LIMIT 30"
    );
    res.json({
      total: total.rows[0].count,
      hot: hot.rows[0].count,
      warm: warm.rows[0].count,
      cold: cold.rows[0].count,
      leadsByDay: byDay.rows
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/export — CSV download (admin) — must be before /:id
router.get('/export', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const result = await client.execute('SELECT * FROM leads ORDER BY created_at DESC');
    const headers = ['id', 'name', 'email', 'phone', 'product', 'score', 'status', 'summary', 'notes', 'followup', 'followup_sent', 'created_at'];
    const csv = [
      headers.join(','),
      ...result.rows.map(row =>
        headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads — all leads (admin)
router.get('/', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const result = await client.execute('SELECT * FROM leads ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Get leads error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads/:id — single lead with conversation (admin)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const lead = await client.execute({
      sql: 'SELECT * FROM leads WHERE id = ?',
      args: [req.params.id]
    });
    if (!lead.rows.length) return res.status(404).json({ error: 'Not found' });
    const session = await client.execute({
      sql: 'SELECT messages FROM chat_sessions WHERE lead_id = ?',
      args: [req.params.id]
    });
    res.json({
      ...lead.rows[0],
      messages: session.rows.length ? JSON.parse(session.rows[0].messages) : []
    });
  } catch (err) {
    console.error('Get lead error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/leads/:id/notes — save admin notes (admin)
router.patch('/:id/notes', requireAuth, async (req, res) => {
  const { notes } = req.body;
  try {
    const client = getClient();
    await client.execute({
      sql: 'UPDATE leads SET notes = ? WHERE id = ?',
      args: [notes || null, req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Update notes error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/leads/:id/status — update status (admin)
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const valid = ['new', 'contacted', 'converted', 'closed'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }
  try {
    const client = getClient();
    await client.execute({
      sql: 'UPDATE leads SET status = ? WHERE id = ?',
      args: [status, req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Update status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
