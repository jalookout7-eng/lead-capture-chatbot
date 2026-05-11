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

describe('GET /api/leads/new-since', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/leads/new-since?since=2026-05-11T00:00:00Z');
    expect(res.status).toBe(401);
  });

  test('returns 400 if since is missing', async () => {
    const res = await request(app).get('/api/leads/new-since').set(authHeader);
    expect(res.status).toBe(400);
  });

  test('returns 400 if since is invalid ISO', async () => {
    const res = await request(app).get('/api/leads/new-since?since=not-a-date').set(authHeader);
    expect(res.status).toBe(400);
  });

  test('returns count and latest array', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/COUNT/i.test(sql)) return { rows: [{ count: 3 }] };
      if (/SELECT id, name/i.test(sql)) {
        return {
          rows: [
            { id: 'l1', name: 'Alice', score: 'hot', product: 'ai_service', created_at: '2026-05-11T12:00:00Z' },
            { id: 'l2', name: 'Bob', score: 'warm', product: 'website', created_at: '2026-05-11T11:00:00Z' }
          ]
        };
      }
      return { rows: [] };
    });
    const res = await request(app)
      .get('/api/leads/new-since?since=2026-05-11T00:00:00Z')
      .set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.latest).toHaveLength(2);
    expect(res.body.latest[0].name).toBe('Alice');
  });

  test('limits latest to 10 most recent', async () => {
    let capturedSql = null;
    mockExecute.mockImplementation(({ sql }) => {
      if (/SELECT id, name/i.test(sql)) {
        capturedSql = sql;
        return { rows: [] };
      }
      if (/COUNT/i.test(sql)) return { rows: [{ count: 50 }] };
      return { rows: [] };
    });
    await request(app)
      .get('/api/leads/new-since?since=2026-05-11T00:00:00Z')
      .set(authHeader);
    expect(capturedSql).toMatch(/LIMIT 10/i);
  });
});
