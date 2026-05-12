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

describe('GET /api/scraper/leads', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/scraper/leads');
    expect(res.status).toBe(401);
  });

  test('returns non-transferred leads ordered by scraped_at DESC', async () => {
    const rows = [
      { id: 'a', name: 'Newer', transferred: 0, scraped_at: '2026-05-12T10:00:00Z' },
      { id: 'b', name: 'Older', transferred: 0, scraped_at: '2026-05-11T10:00:00Z' }
    ];
    let capturedSql = null;
    mockExecute.mockImplementation(({ sql }) => {
      capturedSql = sql;
      return { rows };
    });
    const res = await request(app).get('/api/scraper/leads').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.leads).toEqual(rows);
    expect(capturedSql).toMatch(/transferred\s*=\s*0/i);
    expect(capturedSql).toMatch(/ORDER BY scraped_at DESC/i);
  });

  test('applies status filter from query string', async () => {
    let capturedArgs = null;
    mockExecute.mockImplementation(({ args }) => {
      capturedArgs = args;
      return { rows: [] };
    });
    await request(app).get('/api/scraper/leads?status=Called%20%E2%80%93%20Spoke').set(authHeader);
    expect(capturedArgs).toContain('Called – Spoke');
  });

  test('applies category and country filters', async () => {
    let capturedSql = null;
    let capturedArgs = null;
    mockExecute.mockImplementation(({ sql, args }) => {
      capturedSql = sql;
      capturedArgs = args;
      return { rows: [] };
    });
    await request(app).get('/api/scraper/leads?category=salon&country=Indonesia').set(authHeader);
    expect(capturedSql).toMatch(/category\s*=\s*\?/i);
    expect(capturedSql).toMatch(/country\s*=\s*\?/i);
    expect(capturedArgs).toEqual(expect.arrayContaining(['salon', 'Indonesia']));
  });
});

describe('PATCH /api/scraper/leads/:id/status', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).patch('/api/scraper/leads/abc/status').send({ status: 'Interested' });
    expect(res.status).toBe(401);
  });

  test('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/api/scraper/leads/abc/status')
      .set(authHeader)
      .send({ status: 'Bogus' });
    expect(res.status).toBe(400);
  });

  test('returns 404 when row not found', async () => {
    mockExecute.mockResolvedValueOnce({ rowsAffected: 0 });
    const res = await request(app)
      .patch('/api/scraper/leads/missing/status')
      .set(authHeader)
      .send({ status: 'Interested' });
    expect(res.status).toBe(404);
  });

  test('returns 200 on valid update', async () => {
    mockExecute.mockResolvedValueOnce({ rowsAffected: 1 });
    const res = await request(app)
      .patch('/api/scraper/leads/abc/status')
      .set(authHeader)
      .send({ status: 'Interested' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('accepts all five valid status values', async () => {
    const valid = ['New', 'Called – No Answer', 'Called – Spoke', 'Interested', 'Not Interested'];
    for (const s of valid) {
      mockExecute.mockResolvedValueOnce({ rowsAffected: 1 });
      const res = await request(app)
        .patch('/api/scraper/leads/abc/status')
        .set(authHeader)
        .send({ status: s });
      expect(res.status).toBe(200);
    }
  });
});

describe('POST /api/scraper/leads/:id/transfer', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/scraper/leads/abc/transfer').send({});
    expect(res.status).toBe(401);
  });

  test('returns 404 when scraped lead not found', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/scraper/leads/missing/transfer')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(404);
  });

  test('returns 409 if already transferred', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'abc', transferred: 1 }]
    });
    const res = await request(app)
      .post('/api/scraper/leads/abc/transfer')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(409);
  });

  test('inserts into leads, flips transferred=1, returns new leadId', async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 'abc', name: 'Salon One', phone: '08111', category: 'salon',
          city: 'Jakarta', country: 'Indonesia', google_rating: 4.5,
          website: 'https://salon-one', transferred: 0
        }]
      })
      .mockResolvedValueOnce({ rowsAffected: 1 })  // INSERT leads
      .mockResolvedValueOnce({ rowsAffected: 1 }); // UPDATE scraped_leads
    const res = await request(app)
      .post('/api/scraper/leads/abc/transfer')
      .set(authHeader)
      .send({ email: 'test@example.com', notes: 'Worth a call' });
    expect(res.status).toBe(200);
    expect(res.body.leadId).toBeDefined();
  });

  test('omits email when not provided (null)', async () => {
    let insertedArgs = null;
    mockExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 'abc', name: 'A', phone: '08', category: 'salon',
          city: 'Jakarta', country: 'Indonesia', google_rating: 4.5,
          website: 'https://a', transferred: 0
        }]
      })
      .mockImplementationOnce(({ args }) => { insertedArgs = args; return { rowsAffected: 1 }; })
      .mockResolvedValueOnce({ rowsAffected: 1 });
    await request(app).post('/api/scraper/leads/abc/transfer').set(authHeader).send({ notes: 'x' });
    // email column is 3rd arg in the INSERT (id, name, email, ...)
    expect(insertedArgs[2]).toBeNull();
  });

  test('notes default includes scraper source line', async () => {
    let insertedArgs = null;
    mockExecute
      .mockResolvedValueOnce({
        rows: [{
          id: 'abc', name: 'A', phone: '08', category: 'salon',
          city: 'Jakarta', country: 'Indonesia', google_rating: 4.5,
          website: 'https://a', transferred: 0
        }]
      })
      .mockImplementationOnce(({ args }) => { insertedArgs = args; return { rowsAffected: 1 }; })
      .mockResolvedValueOnce({ rowsAffected: 1 });
    await request(app).post('/api/scraper/leads/abc/transfer').set(authHeader).send({});
    const notesArg = insertedArgs.find(a => typeof a === 'string' && a.includes('Source: Google Maps Scraper'));
    expect(notesArg).toMatch(/Source: Google Maps Scraper/);
    expect(notesArg).toMatch(/Rating: 4\.5\/5/);
    expect(notesArg).toMatch(/City: Jakarta, Indonesia/);
  });
});
