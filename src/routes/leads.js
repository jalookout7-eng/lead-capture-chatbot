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

// GET /api/leads/stats — dashboard stats with optional date filter (admin) — must be before /:id
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const { from, to } = req.query;

    // Build optional BETWEEN clause. If both from and to are provided, parse them as
    // inclusive date ranges (00:00:00 to 23:59:59 of the respective dates).
    let whereDate = '';
    const dateArgs = [];
    if (from && to) {
      whereDate = ' WHERE created_at BETWEEN ? AND ?';
      dateArgs.push(
        new Date(from + 'T00:00:00Z').toISOString(),
        new Date(to + 'T23:59:59.999Z').toISOString()
      );
    }

    const total = await client.execute({
      sql: `SELECT COUNT(*) as count FROM leads${whereDate}`,
      args: dateArgs
    });
    const hot = await client.execute({
      sql: `SELECT COUNT(*) as count FROM leads WHERE score = 'hot'${whereDate ? ' AND created_at BETWEEN ? AND ?' : ''}`,
      args: dateArgs
    });
    const warm = await client.execute({
      sql: `SELECT COUNT(*) as count FROM leads WHERE score = 'warm'${whereDate ? ' AND created_at BETWEEN ? AND ?' : ''}`,
      args: dateArgs
    });
    const cold = await client.execute({
      sql: `SELECT COUNT(*) as count FROM leads WHERE score = 'cold'${whereDate ? ' AND created_at BETWEEN ? AND ?' : ''}`,
      args: dateArgs
    });

    const byDay = await client.execute({
      sql: `SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
            FROM leads${whereDate}
            GROUP BY date ORDER BY date DESC
            LIMIT 60`,
      args: dateArgs
    });

    const pipelineBreakdown = await client.execute({
      sql: `SELECT pipeline_status as label, COUNT(*) as count
            FROM leads
            WHERE pipeline_status IS NOT NULL${whereDate ? ' AND created_at BETWEEN ? AND ?' : ''}
            GROUP BY pipeline_status
            ORDER BY count DESC`,
      args: dateArgs
    });

    res.json({
      total: total.rows[0]?.count ?? 0,
      hot: hot.rows[0]?.count ?? 0,
      warm: warm.rows[0]?.count ?? 0,
      cold: cold.rows[0]?.count ?? 0,
      byDay: byDay.rows,
      pipelineBreakdown: pipelineBreakdown.rows
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

// PATCH /api/leads/:id/pipeline-status — update configurable pipeline status (admin)
router.patch('/:id/pipeline-status', requireAuth, async (req, res) => {
  const { pipeline_status } = req.body;
  // Accept any string label or null. We do NOT validate against pipeline_status_options
  // because the spec says deleting an option leaves existing labels intact on leads.
  if (pipeline_status !== null && typeof pipeline_status !== 'string') {
    return res.status(400).json({ error: 'pipeline_status must be a string or null' });
  }
  try {
    const client = getClient();
    const result = await client.execute({
      sql: 'UPDATE leads SET pipeline_status = ? WHERE id = ?',
      args: [pipeline_status, req.params.id]
    });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update pipeline status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
