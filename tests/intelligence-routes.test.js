const request = require('supertest');

const mockExecute = jest.fn();
jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({ execute: mockExecute })
}));

process.env.ADMIN_TOKEN = 'test-token';
const app = require('../src/server');
const authHeader = { Authorization: 'Bearer test-token' };

beforeEach(() => {
  mockExecute.mockReset();
});

describe('POST /api/leads/:id/tags', () => {
  test('401 without auth', async () => {
    const res = await request(app).post('/api/leads/abc/tags').send({ tag_type: 'exemplary', reason: 'x' });
    expect(res.status).toBe(401);
  });
  test('400 when tag_type invalid', async () => {
    const res = await request(app).post('/api/leads/abc/tags').set(authHeader).send({ tag_type: 'meh', reason: 'x' });
    expect(res.status).toBe(400);
  });
  test('400 when reason empty', async () => {
    const res = await request(app).post('/api/leads/abc/tags').set(authHeader).send({ tag_type: 'exemplary', reason: '' });
    expect(res.status).toBe(400);
  });
  test('404 when lead not found', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/leads/missing/tags').set(authHeader).send({ tag_type: 'exemplary', reason: 'x' });
    expect(res.status).toBe(404);
  });
  test('201 on success returns tag', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: 'abc' }] })  // lead exists
      .mockResolvedValueOnce({ rowsAffected: 1 });        // insert
    const res = await request(app).post('/api/leads/abc/tags').set(authHeader).send({ tag_type: 'problematic', reason: 'rushed the close' });
    expect(res.status).toBe(201);
    expect(res.body.tag).toMatchObject({ lead_id: 'abc', tag_type: 'problematic', reason: 'rushed the close' });
  });
});

describe('GET /api/leads/:id/tags', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/leads/abc/tags');
    expect(res.status).toBe(401);
  });
  test('returns tags ordered tagged_at DESC', async () => {
    const rows = [
      { id: 't2', lead_id: 'abc', tag_type: 'exemplary', reason: 'new', tagged_at: '2026-05-12T10:00:00Z' },
      { id: 't1', lead_id: 'abc', tag_type: 'problematic', reason: 'old', tagged_at: '2026-05-10T10:00:00Z' }
    ];
    let captured = null;
    mockExecute.mockImplementation(({ sql, args }) => { captured = { sql, args }; return { rows }; });
    const res = await request(app).get('/api/leads/abc/tags').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(rows);
    expect(captured.sql).toMatch(/ORDER BY tagged_at DESC/i);
  });
});

describe('GET /api/intelligence/tags (cross-lead)', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/intelligence/tags');
    expect(res.status).toBe(401);
  });
  test('returns joined tag/lead rows with default limit 50', async () => {
    const rows = [{ id: 't1', lead_id: 'L1', lead_name: 'Alice', tag_type: 'exemplary', reason: 'r', tagged_at: '2026-05-12T10:00:00Z' }];
    let captured = null;
    mockExecute.mockImplementation(({ sql, args }) => { captured = { sql, args }; return { rows }; });
    const res = await request(app).get('/api/intelligence/tags').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(rows);
    expect(captured.sql).toMatch(/JOIN leads/i);
    expect(captured.args).toContain(50);
  });
  test('honours ?tag_type= and ?limit=', async () => {
    let captured = null;
    mockExecute.mockImplementation(({ sql, args }) => { captured = { sql, args }; return { rows: [] }; });
    await request(app).get('/api/intelligence/tags?tag_type=problematic&limit=10').set(authHeader);
    expect(captured.args).toEqual(expect.arrayContaining(['problematic', 10]));
  });
});

describe('GET /api/intelligence/versions', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/intelligence/versions');
    expect(res.status).toBe(401);
  });
  test('returns lean rows ordered by version_number DESC', async () => {
    const rows = [
      { id: 'v3', version_number: 3, status: 'pending', source: 'workspace', created_at: '2026-05-12T00:00:00Z' },
      { id: 'v2', version_number: 2, status: 'active',  source: 'workspace', created_at: '2026-05-10T00:00:00Z' }
    ];
    let captured = null;
    mockExecute.mockImplementation(({ sql, args }) => { captured = { sql, args }; return { rows }; });
    const res = await request(app).get('/api/intelligence/versions').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.versions).toEqual(rows);
    expect(captured.sql).toMatch(/ORDER BY version_number DESC/i);
    expect(captured.sql).not.toMatch(/lessons_learned/i); // lean — no content
  });
  test('honours ?status= filter', async () => {
    let captured = null;
    mockExecute.mockImplementation(({ sql, args }) => { captured = { sql, args }; return { rows: [] }; });
    await request(app).get('/api/intelligence/versions?status=pending').set(authHeader);
    expect(captured.args).toContain('pending');
  });
});

describe('GET /api/intelligence/versions/:id', () => {
  test('returns full version content', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'v1', version_number: 1, lessons_learned: 'lessons', scoring_rules: '{}', changelog: 'cl', core_hash: 'h', status: 'active' }]
    });
    const res = await request(app).get('/api/intelligence/versions/v1').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.version.lessons_learned).toBe('lessons');
  });
  test('404 when not found', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/intelligence/versions/missing').set(authHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/intelligence/active', () => {
  test('returns active version', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ id: 'v1', version_number: 1, status: 'active' }] });
    const res = await request(app).get('/api/intelligence/active').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.version.version_number).toBe(1);
  });
  test('503 when no active version', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/intelligence/active').set(authHeader);
    expect(res.status).toBe(503);
  });
});

describe('POST /api/intelligence/versions', () => {
  const validRules = {
    weights: { a: 5 }, thresholds: { hot: 25, warm: 10 },
    signals: { hot_signals: [], warm_signals: [], cold_signals: [] }
  };
  test('400 when scoring_rules schema invalid (missing thresholds.hot)', async () => {
    const res = await request(app).post('/api/intelligence/versions').set(authHeader).send({
      lessons_learned: 'x',
      scoring_rules: { weights: {}, thresholds: { warm: 10 }, signals: { hot_signals: [], warm_signals: [], cold_signals: [] } },
      changelog: 'cl'
    });
    expect(res.status).toBe(400);
  });
  test('400 when signals.hot_signals not array', async () => {
    const res = await request(app).post('/api/intelligence/versions').set(authHeader).send({
      lessons_learned: 'x',
      scoring_rules: { weights: {}, thresholds: { hot: 25, warm: 10 }, signals: { hot_signals: 'oops', warm_signals: [], cold_signals: [] } },
      changelog: 'cl'
    });
    expect(res.status).toBe(400);
  });
  test('201 inserts pending row, assigns next version_number, stamps core_hash', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ max_v: 3 }] })   // MAX(version_number)
      .mockResolvedValueOnce({ rowsAffected: 1 });       // INSERT
    const res = await request(app).post('/api/intelligence/versions').set(authHeader).send({
      lessons_learned: 'new lessons',
      scoring_rules: validRules,
      changelog: 'updated weights'
    });
    expect(res.status).toBe(201);
    expect(res.body.version.version_number).toBe(4);
    expect(res.body.version.status).toBe('pending');
    expect(res.body.version.core_hash).toMatch(/^[a-f0-9]{64}$/);
  });
  test('default source is workspace; manual is honoured', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ max_v: 0 }] })
      .mockResolvedValueOnce({ rowsAffected: 1 });
    const res = await request(app).post('/api/intelligence/versions').set(authHeader).send({
      lessons_learned: '', scoring_rules: validRules, changelog: 'cl', source: 'manual'
    });
    expect(res.body.version.source).toBe('manual');
  });
});

describe('POST /api/intelligence/versions/:id/publish', () => {
  test('401 without auth', async () => {
    const res = await request(app).post('/api/intelligence/versions/v1/publish').send({ published_by: 'john' });
    expect(res.status).toBe(401);
  });
  test('404 when not found', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/intelligence/versions/missing/publish').set(authHeader).send({ published_by: 'john' });
    expect(res.status).toBe(404);
  });
  test('409 when not pending', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ id: 'v1', status: 'active' }] });
    const res = await request(app).post('/api/intelligence/versions/v1/publish').set(authHeader).send({ published_by: 'john' });
    expect(res.status).toBe(409);
  });
  test('200 — archives current active and activates pending', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: 'v2', status: 'pending' }] })  // SELECT target
      .mockResolvedValueOnce({ rowsAffected: 1 })                          // UPDATE archive current
      .mockResolvedValueOnce({ rowsAffected: 1 });                         // UPDATE activate target
    const res = await request(app).post('/api/intelligence/versions/v2/publish').set(authHeader).send({ published_by: 'john@x' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  test('400 when published_by missing', async () => {
    const res = await request(app).post('/api/intelligence/versions/v1/publish').set(authHeader).send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/intelligence/versions/:id/reject', () => {
  test('409 when not pending', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ id: 'v1', status: 'active' }] });
    const res = await request(app).post('/api/intelligence/versions/v1/reject').set(authHeader).send({ reason: 'no' });
    expect(res.status).toBe(409);
  });
  test('200 transitions pending → rejected', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: 'v3', status: 'pending' }] })
      .mockResolvedValueOnce({ rowsAffected: 1 });
    const res = await request(app).post('/api/intelligence/versions/v3/reject').set(authHeader).send({ reason: 'too aggressive' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/intelligence/versions/:id/rollback', () => {
  test('409 when not archived', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ id: 'v1', status: 'pending' }] });
    const res = await request(app).post('/api/intelligence/versions/v1/rollback').set(authHeader).send({ published_by: 'john' });
    expect(res.status).toBe(409);
  });
  test('200 archives current active and re-activates archived', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: 'v1', status: 'archived' }] })
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rowsAffected: 1 });
    const res = await request(app).post('/api/intelligence/versions/v1/rollback').set(authHeader).send({ published_by: 'john' });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/intelligence/analytics', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/intelligence/analytics?from=2026-05-01&to=2026-05-31');
    expect(res.status).toBe(401);
  });
  test('400 when from or to missing', async () => {
    const res = await request(app).get('/api/intelligence/analytics?from=2026-05-01').set(authHeader);
    expect(res.status).toBe(400);
  });
  test('returns current block with score_accuracy, segment_performance, signal_correlation, tag_summary, funnel', async () => {
    // 5 SELECTs for current window (score_accuracy, segment_performance, signal_correlation, tag_summary, funnel)
    mockExecute
      .mockResolvedValueOnce({ rows: [
        { score: 'hot', captured: 14, converted: 5, lost: 3, open: 6 },
        { score: 'warm', captured: 22, converted: 2, lost: 8, open: 12 },
        { score: 'cold', captured: 31, converted: 0, lost: 18, open: 13 }
      ]})
      .mockResolvedValueOnce({ rows: [
        { segment: 'ads', captured: 18, converted: 4 }
      ]})
      .mockResolvedValueOnce({ rows: [{ signals_observed: '["budget_mentioned"]', pipeline_status: 'Closed' }] })
      .mockResolvedValueOnce({ rows: [{ tag_type: 'exemplary', count: 8 }, { tag_type: 'problematic', count: 3 }] })
      .mockResolvedValueOnce({ rows: [
        { stage: 'captured', count: 67 },
        { stage: 'contacted', count: 42 },
        { stage: 'closed', count: 7 },
        { stage: 'lost', count: 29 }
      ]});
    const res = await request(app).get('/api/intelligence/analytics?from=2026-05-01&to=2026-05-31').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.current).toBeDefined();
    expect(res.body.current.score_accuracy.hot.rate).toMatch(/%/);
    expect(res.body.current.tag_summary.exemplary).toBe(8);
    expect(res.body.comparison).toBeNull();
  });
  test('returns comparison block when compare_to=previous', async () => {
    // 10 SELECTs: 5 for current + 5 for comparison
    const empty5 = [
      { rows: [{ score: 'hot', captured: 0, converted: 0, lost: 0, open: 0 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] }
    ];
    [...empty5, ...empty5].forEach(r => mockExecute.mockResolvedValueOnce(r));
    const res = await request(app).get('/api/intelligence/analytics?from=2026-05-01&to=2026-05-31&compare_to=previous').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.comparison).not.toBeNull();
    expect(res.body.deltas).toBeDefined();
  });
});
