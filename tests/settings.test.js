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

describe('GET /api/settings/pipeline-statuses', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/settings/pipeline-statuses');
    expect(res.status).toBe(401);
  });

  test('returns statuses ordered by created_at ASC', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { id: 's1', label: 'Contacted', created_at: '2026-05-01T00:00:00Z' },
        { id: 's2', label: 'Closed', created_at: '2026-05-02T00:00:00Z' }
      ]
    });
    const res = await request(app).get('/api/settings/pipeline-statuses').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.statuses).toHaveLength(2);
    expect(res.body.statuses[0].label).toBe('Contacted');
  });
});

describe('POST /api/settings/pipeline-statuses', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/settings/pipeline-statuses').send({ label: 'New' });
    expect(res.status).toBe(401);
  });

  test('returns 400 if label missing', async () => {
    const res = await request(app)
      .post('/api/settings/pipeline-statuses')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 if label is whitespace only', async () => {
    const res = await request(app)
      .post('/api/settings/pipeline-statuses')
      .set(authHeader)
      .send({ label: '   ' });
    expect(res.status).toBe(400);
  });

  test('returns 409 if label already exists (UNIQUE violation)', async () => {
    const uniqueError = new Error('UNIQUE constraint failed: pipeline_status_options.label');
    mockExecute.mockRejectedValue(uniqueError);
    const res = await request(app)
      .post('/api/settings/pipeline-statuses')
      .set(authHeader)
      .send({ label: 'Contacted' });
    expect(res.status).toBe(409);
  });

  test('returns 201 with new status on success', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/settings/pipeline-statuses')
      .set(authHeader)
      .send({ label: 'Quoted' });
    expect(res.status).toBe(201);
    expect(res.body.status).toMatchObject({ label: 'Quoted' });
    expect(res.body.status.id).toBeDefined();
    expect(res.body.status.created_at).toBeDefined();
  });

  test('trims whitespace from label', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/settings/pipeline-statuses')
      .set(authHeader)
      .send({ label: '  Quoted  ' });
    expect(res.status).toBe(201);
    expect(res.body.status.label).toBe('Quoted');
  });
});

describe('DELETE /api/settings/pipeline-statuses/:id', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/settings/pipeline-statuses/abc');
    expect(res.status).toBe(401);
  });

  test('returns 404 if id not found (rowsAffected = 0)', async () => {
    mockExecute.mockResolvedValue({ rowsAffected: 0 });
    const res = await request(app)
      .delete('/api/settings/pipeline-statuses/missing')
      .set(authHeader);
    expect(res.status).toBe(404);
  });

  test('returns 200 on success', async () => {
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    const res = await request(app)
      .delete('/api/settings/pipeline-statuses/abc')
      .set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('PATCH /api/settings/pipeline-statuses/:id (toggle enabled)', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app)
      .patch('/api/settings/pipeline-statuses/abc')
      .send({ enabled: false });
    expect(res.status).toBe(401);
  });

  test('returns 400 if enabled is not boolean', async () => {
    const res = await request(app)
      .patch('/api/settings/pipeline-statuses/abc')
      .set(authHeader)
      .send({ enabled: 'yes' });
    expect(res.status).toBe(400);
  });

  test('returns 404 if id not found', async () => {
    mockExecute.mockResolvedValue({ rowsAffected: 0 });
    const res = await request(app)
      .patch('/api/settings/pipeline-statuses/missing')
      .set(authHeader)
      .send({ enabled: false });
    expect(res.status).toBe(404);
  });

  test('returns 200 with enabled=false', async () => {
    let capturedArgs = null;
    mockExecute.mockImplementation(({ args }) => {
      capturedArgs = args;
      return { rowsAffected: 1 };
    });
    const res = await request(app)
      .patch('/api/settings/pipeline-statuses/abc')
      .set(authHeader)
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(capturedArgs[0]).toBe(0); // stored as integer 0
  });

  test('returns 200 with enabled=true', async () => {
    let capturedArgs = null;
    mockExecute.mockImplementation(({ args }) => {
      capturedArgs = args;
      return { rowsAffected: 1 };
    });
    const res = await request(app)
      .patch('/api/settings/pipeline-statuses/abc')
      .set(authHeader)
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(capturedArgs[0]).toBe(1); // stored as integer 1
  });
});

describe('GET /api/settings/pipeline-statuses returns enabled flag', () => {
  test('coerces enabled integer to boolean in response', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { id: 's1', label: 'Active', created_at: '2026-05-01T00:00:00Z', enabled: 1 },
        { id: 's2', label: 'Off', created_at: '2026-05-02T00:00:00Z', enabled: 0 }
      ]
    });
    const res = await request(app).get('/api/settings/pipeline-statuses').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.statuses[0].enabled).toBe(true);
    expect(res.body.statuses[1].enabled).toBe(false);
  });
});
