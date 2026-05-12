const request = require('supertest');

const mockExecute = jest.fn();
jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({ execute: mockExecute })
}));

jest.mock('../src/services/scraper', () => ({
  isMobileNumber: jest.fn(),
  searchBusinesses: jest.fn(),
  getPlaceDetails: jest.fn()
}));
const scraperSvc = require('../src/services/scraper');

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

describe('POST /api/scraper/run-chunk', () => {
  beforeEach(() => {
    scraperSvc.isMobileNumber.mockReset().mockReturnValue(true);
    scraperSvc.searchBusinesses.mockReset();
    scraperSvc.getPlaceDetails.mockReset();
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/scraper/run-chunk').send({ city: 'Jakarta', country: 'Indonesia', category: 'salon' });
    expect(res.status).toBe(401);
  });

  test('returns 400 if city/country/category missing', async () => {
    const res = await request(app)
      .post('/api/scraper/run-chunk')
      .set(authHeader)
      .send({ city: 'Jakarta' });
    expect(res.status).toBe(400);
  });

  test('returns 400 if api_key is not set', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { key: 'api_key', value: '' },
        { key: 'max_per_category', value: '3' },
        { key: 'prefer_mobile', value: 'true' }
      ]
    });
    const res = await request(app)
      .post('/api/scraper/run-chunk')
      .set(authHeader)
      .send({ city: 'Jakarta', country: 'Indonesia', category: 'salon' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/api_key/i);
  });

  test('returns 503 on Google Places error', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { key: 'api_key', value: 'KEY' },
        { key: 'max_per_category', value: '3' },
        { key: 'prefer_mobile', value: 'true' }
      ]
    });
    scraperSvc.searchBusinesses.mockRejectedValueOnce(new Error('Google quota exceeded'));
    const res = await request(app)
      .post('/api/scraper/run-chunk')
      .set(authHeader)
      .send({ city: 'Jakarta', country: 'Indonesia', category: 'salon' });
    expect(res.status).toBe(503);
  });

  test('inserts new leads, skips duplicates, returns counts', async () => {
    // First call: loadAllConfig
    mockExecute.mockResolvedValueOnce({
      rows: [
        { key: 'api_key', value: 'KEY' },
        { key: 'max_per_category', value: '3' },
        { key: 'prefer_mobile', value: 'false' }
      ]
    });
    scraperSvc.searchBusinesses.mockResolvedValueOnce([
      { place_id: 'p1', name: 'A', rating: 4.5 },
      { place_id: 'p2', name: 'B', rating: 4.2 }
    ]);
    scraperSvc.getPlaceDetails
      .mockResolvedValueOnce({ placeId: 'p1', name: 'A', address: 'addr A', phone: '08111', website: 'https://a', rating: 4.5, totalReviews: 10, mapsUrl: 'https://maps/a' })
      .mockResolvedValueOnce({ placeId: 'p2', name: 'B', address: 'addr B', phone: '08222', website: 'https://b', rating: 4.2, totalReviews: 20, mapsUrl: 'https://maps/b' });
    // Dedup SELECTs: p1 not found, p2 found
    mockExecute
      .mockResolvedValueOnce({ rows: [] })             // SELECT p1
      .mockResolvedValueOnce({ rows: [] })             // INSERT p1
      .mockResolvedValueOnce({ rows: [{ id: 'x' }] }); // SELECT p2 (exists)
    const res = await request(app)
      .post('/api/scraper/run-chunk')
      .set(authHeader)
      .send({ city: 'Jakarta', country: 'Indonesia', category: 'salon' });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.skipped).toBe(1);
    expect(res.body.leads).toHaveLength(1);
    expect(res.body.leads[0].name).toBe('A');
    expect(res.body.leads[0].city).toBe('Jakarta');
  });

  test('respects max_per_category cap', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { key: 'api_key', value: 'KEY' },
        { key: 'max_per_category', value: '2' },
        { key: 'prefer_mobile', value: 'false' }
      ]
    });
    scraperSvc.searchBusinesses.mockResolvedValueOnce([
      { place_id: 'p1', name: 'A' }, { place_id: 'p2', name: 'B' }, { place_id: 'p3', name: 'C' }, { place_id: 'p4', name: 'D' }
    ]);
    scraperSvc.getPlaceDetails
      .mockResolvedValueOnce({ placeId: 'p1', name: 'A', phone: '08', rating: 4 })
      .mockResolvedValueOnce({ placeId: 'p2', name: 'B', phone: '08', rating: 4 });
    mockExecute
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/scraper/run-chunk')
      .set(authHeader)
      .send({ city: 'Jakarta', country: 'Indonesia', category: 'salon' });
    expect(res.status).toBe(200);
    expect(scraperSvc.getPlaceDetails).toHaveBeenCalledTimes(2);
    expect(res.body.inserted).toBe(2);
  });

  test('skips landlines when prefer_mobile=true', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { key: 'api_key', value: 'KEY' },
        { key: 'max_per_category', value: '3' },
        { key: 'prefer_mobile', value: 'true' }
      ]
    });
    scraperSvc.searchBusinesses.mockResolvedValueOnce([
      { place_id: 'p1', name: 'Landline' }, { place_id: 'p2', name: 'Mobile' }
    ]);
    scraperSvc.getPlaceDetails
      .mockResolvedValueOnce({ placeId: 'p1', name: 'Landline', phone: '021555' })
      .mockResolvedValueOnce({ placeId: 'p2', name: 'Mobile', phone: '08111' });
    scraperSvc.isMobileNumber.mockImplementation(p => p === '08111');
    mockExecute
      .mockResolvedValueOnce({ rows: [] })   // SELECT p2
      .mockResolvedValueOnce({ rows: [] });  // INSERT p2
    const res = await request(app)
      .post('/api/scraper/run-chunk')
      .set(authHeader)
      .send({ city: 'Jakarta', country: 'Indonesia', category: 'salon' });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.leads[0].name).toBe('Mobile');
  });
});
