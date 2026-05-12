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

describe('GET /api/scraper/config', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/scraper/config');
    expect(res.status).toBe(401);
  });

  test('returns config with api_key masked when set', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { key: 'api_key', value: 'real-secret-key' },
        { key: 'categories', value: JSON.stringify(['salon', 'spa']) },
        { key: 'cities', value: JSON.stringify({ Indonesia: ['Jakarta'] }) },
        { key: 'max_leads_per_run', value: '15' },
        { key: 'max_per_category', value: '3' },
        { key: 'prefer_mobile', value: 'true' }
      ]
    });
    const res = await request(app).get('/api/scraper/config').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.config.api_key).toBe('●●●●●');
    expect(res.body.config.categories).toEqual(['salon', 'spa']);
    expect(res.body.config.cities).toEqual({ Indonesia: ['Jakarta'] });
    expect(res.body.config.max_leads_per_run).toBe('15');
    expect(res.body.config.prefer_mobile).toBe('true');
  });

  test('returns empty string for api_key when not set', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ key: 'api_key', value: '' }]
    });
    const res = await request(app).get('/api/scraper/config').set(authHeader);
    expect(res.body.config.api_key).toBe('');
  });
});

describe('PATCH /api/scraper/config', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).patch('/api/scraper/config').send({ max_leads_per_run: '20' });
    expect(res.status).toBe(401);
  });

  test('returns 400 when api_key is explicitly set to empty string', async () => {
    const res = await request(app)
      .patch('/api/scraper/config')
      .set(authHeader)
      .send({ api_key: '' });
    expect(res.status).toBe(400);
  });

  test('upserts each provided key and returns success', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .patch('/api/scraper/config')
      .set(authHeader)
      .send({ max_leads_per_run: '20', prefer_mobile: 'false' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  test('JSON-encodes array/object values', async () => {
    const calls = [];
    mockExecute.mockImplementation(({ args }) => {
      calls.push(args);
      return { rows: [] };
    });
    await request(app)
      .patch('/api/scraper/config')
      .set(authHeader)
      .send({
        categories: ['salon', 'cafe'],
        cities: { Indonesia: ['Jakarta'], Malaysia: ['KL'] }
      });
    expect(calls[0][1]).toBe(JSON.stringify(['salon', 'cafe']));
    expect(calls[1][1]).toBe(JSON.stringify({ Indonesia: ['Jakarta'], Malaysia: ['KL'] }));
  });
});
