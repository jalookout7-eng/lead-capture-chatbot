const express = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getClient } = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { invalidateCache } = require('../services/intelligence');

const router = express.Router();

const VALID_TAG_TYPES = ['exemplary', 'problematic'];

const CORE_PROMPT_PATH = path.join(__dirname, '..', 'services', 'aria-core-prompt.md');

function currentCoreHash() {
  const content = fs.readFileSync(CORE_PROMPT_PATH, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function validateScoringRules(rules) {
  if (!rules || typeof rules !== 'object') return 'scoring_rules must be an object';
  if (!rules.weights || typeof rules.weights !== 'object') return 'scoring_rules.weights must be an object';
  for (const [k, v] of Object.entries(rules.weights)) {
    if (typeof v !== 'number') return `scoring_rules.weights.${k} must be a number`;
  }
  if (!rules.thresholds || typeof rules.thresholds.hot !== 'number' || typeof rules.thresholds.warm !== 'number') {
    return 'scoring_rules.thresholds.hot and .warm must be numbers';
  }
  if (!rules.signals) return 'scoring_rules.signals is required';
  for (const k of ['hot_signals', 'warm_signals', 'cold_signals']) {
    if (!Array.isArray(rules.signals[k])) return `scoring_rules.signals.${k} must be an array`;
  }
  return null;
}

// ---- Lead Tag Routes ----

router.post('/leads/:id/tags', requireAuth, async (req, res) => {
  const { tag_type, reason } = req.body || {};
  if (!VALID_TAG_TYPES.includes(tag_type)) return res.status(400).json({ error: `tag_type must be one of: ${VALID_TAG_TYPES.join(', ')}` });
  if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'reason is required' });
  try {
    const client = getClient();
    const lead = await client.execute({ sql: 'SELECT id FROM leads WHERE id = ?', args: [req.params.id] });
    if (!lead.rows.length) return res.status(404).json({ error: 'Lead not found' });
    const id = randomUUID();
    const tagged_at = new Date().toISOString();
    await client.execute({
      sql: 'INSERT INTO lead_tags (id, lead_id, tag_type, reason, tagged_at) VALUES (?, ?, ?, ?, ?)',
      args: [id, req.params.id, tag_type, reason.trim(), tagged_at]
    });
    res.status(201).json({ tag: { id, lead_id: req.params.id, tag_type, reason: reason.trim(), tagged_at } });
  } catch (err) {
    console.error('Lead tag POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/leads/:id/tags', requireAuth, async (req, res) => {
  try {
    const result = await getClient().execute({
      sql: 'SELECT * FROM lead_tags WHERE lead_id = ? ORDER BY tagged_at DESC',
      args: [req.params.id]
    });
    res.json({ tags: result.rows });
  } catch (err) {
    console.error('Lead tags GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/intelligence/tags', requireAuth, async (req, res) => {
  try {
    const tagType = req.query.tag_type;
    const limit = parseInt(req.query.limit || '50', 10);
    const where = [];
    const args = [];
    if (tagType) { where.push('t.tag_type = ?'); args.push(tagType); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    args.push(limit);
    const sql = `SELECT t.id, t.lead_id, l.name AS lead_name, t.tag_type, t.reason, t.tagged_at
                 FROM lead_tags t JOIN leads l ON l.id = t.lead_id
                 ${whereSql}
                 ORDER BY t.tagged_at DESC LIMIT ?`;
    const result = await getClient().execute({ sql, args });
    res.json({ tags: result.rows });
  } catch (err) {
    console.error('Intelligence tags GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- Intelligence Version Routes ----

router.get('/intelligence/versions', requireAuth, async (req, res) => {
  try {
    const args = [];
    let where = '';
    if (req.query.status) { where = 'WHERE status = ?'; args.push(req.query.status); }
    const sql = `SELECT id, version_number, status, source, created_at, published_at, published_by, archived_at, changelog, core_hash
                 FROM intelligence_versions ${where} ORDER BY version_number DESC`;
    const result = await getClient().execute({ sql, args });
    res.json({ versions: result.rows });
  } catch (err) {
    console.error('Versions list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/intelligence/active', requireAuth, async (req, res) => {
  try {
    const result = await getClient().execute({
      sql: 'SELECT * FROM intelligence_versions WHERE status = ? LIMIT 1',
      args: ['active']
    });
    if (!result.rows.length) return res.status(503).json({ error: 'No active intelligence version' });
    res.json({ version: result.rows[0] });
  } catch (err) {
    console.error('Active version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/intelligence/versions/:id', requireAuth, async (req, res) => {
  try {
    const result = await getClient().execute({
      sql: 'SELECT * FROM intelligence_versions WHERE id = ?',
      args: [req.params.id]
    });
    if (!result.rows.length) return res.status(404).json({ error: 'Version not found' });
    res.json({ version: result.rows[0] });
  } catch (err) {
    console.error('Version GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/intelligence/versions', requireAuth, async (req, res) => {
  const { lessons_learned, scoring_rules, changelog, source } = req.body || {};
  if (typeof lessons_learned !== 'string') return res.status(400).json({ error: 'lessons_learned must be a string (may be empty)' });
  if (typeof changelog !== 'string' || !changelog.trim()) return res.status(400).json({ error: 'changelog is required' });
  const rulesErr = validateScoringRules(scoring_rules);
  if (rulesErr) return res.status(400).json({ error: rulesErr });
  const srcValue = source && ['workspace', 'manual', 'seed'].includes(source) ? source : 'workspace';
  try {
    const client = getClient();
    const maxResult = await client.execute('SELECT COALESCE(MAX(version_number), 0) AS max_v FROM intelligence_versions');
    const nextV = (maxResult.rows[0]?.max_v ?? 0) + 1;
    const id = randomUUID();
    const created_at = new Date().toISOString();
    const core_hash = currentCoreHash();
    await client.execute({
      sql: `INSERT INTO intelligence_versions
            (id, version_number, lessons_learned, scoring_rules, changelog, core_hash, status, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      args: [id, nextV, lessons_learned, JSON.stringify(scoring_rules), changelog, core_hash, srcValue, created_at]
    });
    res.status(201).json({
      version: { id, version_number: nextV, status: 'pending', source: srcValue, core_hash, created_at, changelog }
    });
  } catch (err) {
    console.error('Version POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- Publish / Reject / Rollback Routes ----

async function transitionPendingToActive(client, versionId, published_by) {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE intelligence_versions SET status = 'archived', archived_at = ? WHERE status = 'active'`,
    args: [now]
  });
  await client.execute({
    sql: `UPDATE intelligence_versions SET status = 'active', published_at = ?, published_by = ?, archived_at = NULL WHERE id = ?`,
    args: [now, published_by, versionId]
  });
}

router.post('/intelligence/versions/:id/publish', requireAuth, async (req, res) => {
  const { published_by } = req.body || {};
  if (!published_by) return res.status(400).json({ error: 'published_by is required' });
  try {
    const client = getClient();
    const found = await client.execute({ sql: 'SELECT id, status FROM intelligence_versions WHERE id = ?', args: [req.params.id] });
    if (!found.rows.length) return res.status(404).json({ error: 'Version not found' });
    if (found.rows[0].status !== 'pending') return res.status(409).json({ error: `Version is ${found.rows[0].status}, not pending` });
    await transitionPendingToActive(client, req.params.id, published_by);
    invalidateCache();
    res.json({ success: true });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/intelligence/versions/:id/reject', requireAuth, async (req, res) => {
  try {
    const client = getClient();
    const found = await client.execute({ sql: 'SELECT id, status FROM intelligence_versions WHERE id = ?', args: [req.params.id] });
    if (!found.rows.length) return res.status(404).json({ error: 'Version not found' });
    if (found.rows[0].status !== 'pending') return res.status(409).json({ error: `Version is ${found.rows[0].status}, not pending` });
    await client.execute({
      sql: `UPDATE intelligence_versions SET status = 'rejected' WHERE id = ?`,
      args: [req.params.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/intelligence/versions/:id/rollback', requireAuth, async (req, res) => {
  const { published_by } = req.body || {};
  if (!published_by) return res.status(400).json({ error: 'published_by is required' });
  try {
    const client = getClient();
    const found = await client.execute({ sql: 'SELECT id, status FROM intelligence_versions WHERE id = ?', args: [req.params.id] });
    if (!found.rows.length) return res.status(404).json({ error: 'Version not found' });
    if (found.rows[0].status !== 'archived') return res.status(409).json({ error: `Version is ${found.rows[0].status}, not archived` });
    await transitionPendingToActive(client, req.params.id, published_by);
    invalidateCache();
    res.json({ success: true });
  } catch (err) {
    console.error('Rollback error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---- Analytics Route ----

function dateRange(fromStr, toStr) {
  return [
    new Date(fromStr + 'T00:00:00Z').toISOString(),
    new Date(toStr + 'T23:59:59.999Z').toISOString()
  ];
}

function shiftDays(d, days) {
  const date = new Date(d);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function comparisonWindow(from, to, mode) {
  const lengthDays = Math.round((new Date(to) - new Date(from)) / 86400000);
  if (mode === 'previous')   return [shiftDays(from, -(lengthDays + 1)), shiftDays(from, -1)];
  if (mode === 'quarter')    return [shiftDays(from, -90),               shiftDays(to, -90)];
  if (mode === 'year')       return [shiftDays(from, -365),              shiftDays(to, -365)];
  return null;
}

async function computeWindow(client, from, to) {
  const [fromIso, toIso] = dateRange(from, to);

  // 1. score_accuracy: per-score captured/converted/lost/open in window
  const scoreRows = await client.execute({
    sql: `SELECT score,
                 COUNT(*) AS captured,
                 SUM(CASE WHEN pipeline_status = 'Closed' THEN 1 ELSE 0 END) AS converted,
                 SUM(CASE WHEN pipeline_status = 'Lost'   THEN 1 ELSE 0 END) AS lost,
                 SUM(CASE WHEN pipeline_status IS NULL OR pipeline_status NOT IN ('Closed', 'Lost') THEN 1 ELSE 0 END) AS open
          FROM leads
          WHERE created_at BETWEEN ? AND ?
          GROUP BY score`,
    args: [fromIso, toIso]
  });
  const score_accuracy = { hot: zeroRow(), warm: zeroRow(), cold: zeroRow() };
  for (const r of scoreRows.rows) {
    if (!score_accuracy[r.score]) continue;
    score_accuracy[r.score] = withRate(r);
  }

  // 2. segment_performance: per-product captured/converted
  const segRows = await client.execute({
    sql: `SELECT product AS segment, COUNT(*) AS captured,
                 SUM(CASE WHEN pipeline_status = 'Closed' THEN 1 ELSE 0 END) AS converted
          FROM leads
          WHERE created_at BETWEEN ? AND ?
          GROUP BY product
          ORDER BY captured DESC`,
    args: [fromIso, toIso]
  });
  const segment_performance = segRows.rows.map(r => ({
    segment: r.segment, captured: r.captured, converted: r.converted, rate: pct(r.converted, r.captured)
  }));

  // 3. signal_correlation: cross-tabulate signals_observed JSON arrays with conversion
  const signalRaw = await client.execute({
    sql: `SELECT signals_observed, pipeline_status FROM leads WHERE created_at BETWEEN ? AND ?`,
    args: [fromIso, toIso]
  });
  const signalTally = new Map();
  for (const r of signalRaw.rows) {
    if (!r.signals_observed) continue;
    let signals;
    try { signals = JSON.parse(r.signals_observed); } catch { continue; }
    if (!Array.isArray(signals)) continue;
    for (const sig of signals) {
      const entry = signalTally.get(sig) || { signal: sig, captured: 0, converted: 0 };
      entry.captured++;
      if (r.pipeline_status === 'Closed') entry.converted++;
      signalTally.set(sig, entry);
    }
  }
  const signal_correlation = [...signalTally.values()]
    .map(e => ({ ...e, rate: pct(e.converted, e.captured) }))
    .sort((a, b) => b.captured - a.captured);

  // 4. tag_summary: count by tag_type in window
  const tagRows = await client.execute({
    sql: `SELECT tag_type, COUNT(*) AS count FROM lead_tags WHERE tagged_at BETWEEN ? AND ? GROUP BY tag_type`,
    args: [fromIso, toIso]
  });
  const tag_summary = { exemplary: 0, problematic: 0 };
  for (const r of tagRows.rows) {
    if (tag_summary[r.tag_type] !== undefined) tag_summary[r.tag_type] = r.count;
  }

  // 5. funnel: captured / contacted / closed / lost
  const funnelRows = await client.execute({
    sql: `SELECT 'captured' AS stage, COUNT(*) AS count FROM leads WHERE created_at BETWEEN ? AND ?
          UNION ALL
          SELECT 'contacted', COUNT(*) FROM leads WHERE created_at BETWEEN ? AND ? AND status IN ('contacted', 'converted', 'closed')
          UNION ALL
          SELECT 'closed', COUNT(*) FROM leads WHERE created_at BETWEEN ? AND ? AND pipeline_status = 'Closed'
          UNION ALL
          SELECT 'lost', COUNT(*) FROM leads WHERE created_at BETWEEN ? AND ? AND pipeline_status = 'Lost'`,
    args: [fromIso, toIso, fromIso, toIso, fromIso, toIso, fromIso, toIso]
  });
  const funnel = { captured: 0, contacted: 0, meeting_done: 0, closed: 0, lost: 0 };
  for (const r of funnelRows.rows) {
    if (funnel[r.stage] !== undefined) funnel[r.stage] = r.count;
  }

  return { score_accuracy, segment_performance, signal_correlation, tag_summary, funnel };
}

function zeroRow() { return { captured: 0, converted: 0, lost: 0, open: 0, rate: '0%' }; }
function withRate(r) {
  return {
    captured: r.captured, converted: r.converted, lost: r.lost, open: r.open,
    rate: pct(r.converted, r.captured)
  };
}
function pct(num, den) {
  if (!den) return '0%';
  return ((num / den) * 100).toFixed(1).replace(/\.0$/, '') + '%';
}
function deltaDirection(curRate, prevRate) {
  const c = parseFloat(curRate);
  const p = parseFloat(prevRate);
  const d = c - p;
  let direction = 'flat';
  if (d > 0.5) direction = 'up';
  else if (d < -0.5) direction = 'down';
  const sign = d > 0 ? '+' : '';
  return { rate_delta: `${sign}${d.toFixed(1)}%`, direction };
}

function computeDeltas(current, comparison) {
  const deltas = { score_accuracy: {}, segment_performance: [], funnel: {} };
  for (const k of ['hot', 'warm', 'cold']) {
    deltas.score_accuracy[k] = deltaDirection(current.score_accuracy[k].rate, comparison.score_accuracy[k].rate);
  }
  const compSegByName = Object.fromEntries(comparison.segment_performance.map(s => [s.segment, s]));
  for (const cur of current.segment_performance) {
    const prev = compSegByName[cur.segment];
    if (!prev) continue;
    deltas.segment_performance.push({ segment: cur.segment, ...deltaDirection(cur.rate, prev.rate) });
  }
  for (const k of ['captured', 'contacted', 'closed', 'lost']) {
    const cur = current.funnel[k];
    const prev = comparison.funnel[k];
    const d = cur - prev;
    let direction = 'flat';
    if (d > 0) direction = 'up';
    else if (d < 0) direction = 'down';
    const ratePct = prev ? ((d / prev) * 100).toFixed(1) : '0';
    deltas.funnel[k] = { delta: `${d >= 0 ? '+' : ''}${d}`, rate_delta: `${d >= 0 ? '+' : ''}${ratePct}%`, direction };
  }
  return deltas;
}

router.get('/intelligence/analytics', requireAuth, async (req, res) => {
  const { from, to, compare_to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' });
  try {
    const client = getClient();
    const current = await computeWindow(client, from, to);
    let comparison = null;
    let deltas = null;
    if (compare_to && ['previous', 'quarter', 'year'].includes(compare_to)) {
      const win = comparisonWindow(from, to, compare_to);
      if (win) {
        comparison = await computeWindow(client, win[0], win[1]);
        deltas = computeDeltas(current, comparison);
      }
    }
    res.json({ current, comparison, deltas });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
