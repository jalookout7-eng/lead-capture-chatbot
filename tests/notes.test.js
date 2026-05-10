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

describe('GET /api/leads/:id/notes', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/leads/lead-1/notes');
    expect(res.status).toBe(401);
  });

  test('returns 404 if lead not found', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM leads WHERE id/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const res = await request(app).get('/api/leads/missing/notes').set(authHeader);
    expect(res.status).toBe(404);
  });

  test('returns notes ordered newest first', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM leads WHERE id/i.test(sql)) return { rows: [{ id: 'lead-1' }] };
      if (/FROM lead_notes WHERE lead_id/i.test(sql)) {
        return {
          rows: [
            { id: 'n2', lead_id: 'lead-1', content: 'Newer', created_at: '2026-05-09T10:00:00Z' },
            { id: 'n1', lead_id: 'lead-1', content: 'Older', created_at: '2026-05-08T10:00:00Z' }
          ]
        };
      }
      return { rows: [] };
    });
    const res = await request(app).get('/api/leads/lead-1/notes').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(2);
    expect(res.body.notes[0].content).toBe('Newer');
  });
});

describe('POST /api/leads/:id/notes', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/leads/lead-1/notes').send({ content: 'x' });
    expect(res.status).toBe(401);
  });

  test('returns 400 if content empty', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM leads WHERE id/i.test(sql)) return { rows: [{ id: 'lead-1' }] };
      return { rows: [] };
    });
    const res = await request(app)
      .post('/api/leads/lead-1/notes')
      .set(authHeader)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  test('returns 400 if content missing', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM leads WHERE id/i.test(sql)) return { rows: [{ id: 'lead-1' }] };
      return { rows: [] };
    });
    const res = await request(app)
      .post('/api/leads/lead-1/notes')
      .set(authHeader)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 404 if lead not found', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM leads WHERE id/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const res = await request(app)
      .post('/api/leads/missing/notes')
      .set(authHeader)
      .send({ content: 'hello' });
    expect(res.status).toBe(404);
  });

  test('creates note and returns 201 with note object', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM leads WHERE id/i.test(sql)) return { rows: [{ id: 'lead-1' }] };
      if (/INSERT INTO lead_notes/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const res = await request(app)
      .post('/api/leads/lead-1/notes')
      .set(authHeader)
      .send({ content: 'Called on Friday' });
    expect(res.status).toBe(201);
    expect(res.body.note).toMatchObject({
      lead_id: 'lead-1',
      content: 'Called on Friday'
    });
    expect(res.body.note.id).toBeDefined();
    expect(res.body.note.created_at).toBeDefined();
  });
});
