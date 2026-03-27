const request = require('supertest');

// Mock AI service
jest.mock('../src/services/ai', () => ({
  complete: jest.fn().mockResolvedValue('How can I help you today?')
}));

// Mock DB
jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({
    execute: jest.fn().mockResolvedValue({ rows: [] })
  })
}));

const app = require('../src/server');

describe('POST /api/chat', () => {
  test('returns 400 if message is missing', async () => {
    const res = await request(app).post('/api/chat').send({});
    expect(res.status).toBe(400);
  });

  test('creates new session when sessionId is null', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: null, message: 'Hello' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessionId');
    expect(res.body).toHaveProperty('reply');
    expect(res.body).toHaveProperty('stage');
    expect(res.body).toHaveProperty('captureReady');
  });

  test('reply is a non-empty string', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: null, message: 'Hello' });
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.reply.length).toBeGreaterThan(0);
  });
});
