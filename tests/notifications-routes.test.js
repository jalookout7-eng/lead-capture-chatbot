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

describe('POST /api/push/subscribe', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/push/subscribe').send({
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'p', auth: 'a' }
    });
    expect(res.status).toBe(401);
  });

  test('returns 400 if endpoint missing', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set(authHeader)
      .send({ keys: { p256dh: 'p', auth: 'a' } });
    expect(res.status).toBe(400);
  });

  test('returns 400 if keys missing', async () => {
    const res = await request(app)
      .post('/api/push/subscribe')
      .set(authHeader)
      .send({ endpoint: 'https://push.example/1' });
    expect(res.status).toBe(400);
  });

  test('upserts subscription and returns success', async () => {
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    const res = await request(app)
      .post('/api/push/subscribe')
      .set(authHeader)
      .send({
        endpoint: 'https://push.example/1',
        keys: { p256dh: 'p', auth: 'a' },
        userAgent: 'TestBrowser'
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/push/subscribe', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app)
      .delete('/api/push/subscribe')
      .send({ endpoint: 'https://push.example/1' });
    expect(res.status).toBe(401);
  });

  test('returns 400 if endpoint missing', async () => {
    const res = await request(app)
      .delete('/api/push/subscribe')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 200 on success (idempotent — also when endpoint not found)', async () => {
    mockExecute.mockResolvedValue({ rowsAffected: 0 });
    const res = await request(app)
      .delete('/api/push/subscribe')
      .set(authHeader)
      .send({ endpoint: 'https://push.example/missing' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/push/vapid-key (no auth)', () => {
  test('returns the public key from scraper_config', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/scraper_config/i.test(sql)) return { rows: [{ value: 'PUBKEY' }] };
      return { rows: [] };
    });
    const res = await request(app).get('/api/push/vapid-key');
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe('PUBKEY');
  });

  test('returns 503 if VAPID public key not set', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/push/vapid-key');
    expect(res.status).toBe(503);
  });
});
