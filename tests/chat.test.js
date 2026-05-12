const request = require('supertest');
const path = require('path');
const fs = require('fs');

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
const ai = require('../src/services/ai');

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

  test('detects marketing product signal', async () => {
    ai.complete.mockResolvedValueOnce('That sounds interesting!\nPRODUCT:marketing\n');
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: null, message: 'I need help with ads' });
    expect(res.status).toBe(200);
    expect(res.body.product).toBe('marketing');
    expect(res.body.reply).not.toContain('PRODUCT:');
  });

  test('detects consultancy product signal', async () => {
    ai.complete.mockResolvedValueOnce('Interesting!\nPRODUCT:consultancy\n');
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: null, message: 'I need business advice' });
    expect(res.status).toBe(200);
    expect(res.body.product).toBe('consultancy');
  });
});

test('aria-core-prompt.md exists and includes the Aria persona declaration', () => {
  const corePath = path.join(__dirname, '..', 'src', 'services', 'aria-core-prompt.md');
  expect(fs.existsSync(corePath)).toBe(true);
  const content = fs.readFileSync(corePath, 'utf8');
  expect(content).toMatch(/Aria, a senior digital marketing consultant/);
  expect(content).toMatch(/CAPTURE_READY/);
  expect(content).toMatch(/SEGMENT:ads/);
});
