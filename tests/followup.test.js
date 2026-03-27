const request = require('supertest');

jest.mock('../src/services/qualifier', () => ({
  qualifyLead: jest.fn().mockResolvedValue({
    summary: 'S', bottlenecks: [], score: 'warm', followup: 'New followup message'
  })
}));

jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({
    execute: jest.fn().mockImplementation(({ sql }) => {
      if (sql && sql.includes('chat_sessions')) return { rows: [{ messages: '[]' }] };
      return { rows: [{ id: 'lead-1', followup: 'Old msg', followup_sent: 0 }] };
    })
  })
}));

process.env.ADMIN_TOKEN = 'test-token';
const app = require('../src/server');

describe('POST /api/followup/:id', () => {
  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/followup/lead-1');
    expect(res.status).toBe(401);
  });

  test('regenerates followup message', async () => {
    const res = await request(app)
      .post('/api/followup/lead-1')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('followup');
  });
});

describe('PATCH /api/followup/:id', () => {
  test('updates followup text and sent status', async () => {
    const res = await request(app)
      .patch('/api/followup/lead-1')
      .set('Authorization', 'Bearer test-token')
      .send({ followup: 'Updated message', sent: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
