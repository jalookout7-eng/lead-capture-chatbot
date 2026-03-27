const request = require('supertest');

jest.mock('../src/services/qualifier', () => ({
  qualifyLead: jest.fn().mockResolvedValue({
    summary: 'Test summary',
    bottlenecks: ['bottleneck 1'],
    score: 'hot',
    followup: 'Hi there, great chatting with you!'
  })
}));

jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({
    execute: jest.fn().mockImplementation(({ sql }) => {
      if (sql && sql.startsWith('SELECT') && sql.includes('leads')) {
        return { rows: [{ id: 'test-id', name: 'Jane', email: 'jane@test.com', product: 'ai_service', score: 'hot', status: 'new', created_at: new Date().toISOString(), followup_sent: 0 }] };
      }
      if (sql && sql.startsWith('SELECT') && sql.includes('chat_sessions')) {
        return { rows: [{ messages: JSON.stringify([{ role: 'user', content: 'Hi' }]) }] };
      }
      return { rows: [] };
    })
  })
}));

process.env.ADMIN_TOKEN = 'test-token';
const app = require('../src/server');

describe('POST /api/leads', () => {
  test('returns 400 if required fields missing', async () => {
    const res = await request(app).post('/api/leads').send({ name: 'Jane' });
    expect(res.status).toBe(400);
  });

  test('creates lead and returns score and followup', async () => {
    const res = await request(app).post('/api/leads').send({
      sessionId: 'session-123',
      name: 'Jane Doe',
      email: 'jane@test.com',
      product: 'ai_service'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('score');
    expect(res.body).toHaveProperty('followup');
  });
});

describe('GET /api/leads', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  test('returns leads array with valid token', async () => {
    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
