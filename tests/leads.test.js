const request = require('supertest');

const mockNotifyNewLead = jest.fn().mockResolvedValue([]);
jest.mock('../src/services/notifications', () => ({
  notifyNewLead: mockNotifyNewLead
}));

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

describe('POST /api/leads with phone', () => {
  test('creates lead with optional phone field', async () => {
    const res = await request(app).post('/api/leads').send({
      sessionId: 'session-123',
      name: 'Jane Doe',
      email: 'jane@test.com',
      product: 'ai_service',
      phone: '+971 50 123 4567'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });

  test('creates lead without phone field (backward compatible)', async () => {
    const res = await request(app).post('/api/leads').send({
      sessionId: 'session-123',
      name: 'Jane Doe',
      email: 'jane@test.com',
      product: 'ai_service'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });
});

describe('PATCH /api/leads/:id/notes', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(app)
      .patch('/api/leads/test-id/notes')
      .send({ notes: 'Some notes' });
    expect(res.status).toBe(401);
  });

  test('saves notes and returns success', async () => {
    const res = await request(app)
      .patch('/api/leads/test-id/notes')
      .set('Authorization', 'Bearer test-token')
      .send({ notes: 'Called on Friday, interested in AI chatbot' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/leads/manual', () => {
  test('creates a manual lead with valid data', async () => {
    const res = await request(app)
      .post('/api/leads/manual')
      .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
      .send({ name: 'Test Lead', email: 'test@example.com', phone: '+971501234567', product: 'website', score: 'warm', notes: 'Met at event' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.score).toBe('warm');
  });

  test('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/leads/manual')
      .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
      .send({ name: 'Test Lead' });
    expect(res.status).toBe(400);
  });

  test('rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/leads/manual')
      .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
      .send({ name: 'Test', email: 'invalid', product: 'website', score: 'hot' });
    expect(res.status).toBe(400);
  });

  test('rejects invalid score', async () => {
    const res = await request(app)
      .post('/api/leads/manual')
      .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
      .send({ name: 'Test', email: 'test@x.com', product: 'website', score: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('requires auth', async () => {
    const res = await request(app)
      .post('/api/leads/manual')
      .send({ name: 'Test', email: 'test@x.com', product: 'website', score: 'hot' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/leads/import', () => {
  test('imports multiple valid leads', async () => {
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
      .send({ leads: [
        { name: 'A', email: 'a@x.com', product: 'website', score: 'hot' },
        { name: 'B', email: 'b@x.com', product: 'marketing', score: 'warm', phone: '+1234', notes: 'Note' }
      ]});
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toHaveLength(0);
  });

  test('returns partial success with row errors', async () => {
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
      .send({ leads: [
        { name: 'Good', email: 'g@x.com', product: 'website', score: 'hot' },
        { name: 'Bad', email: 'noemail', product: 'website', score: 'hot' },
        { name: 'Bad2', email: 'b@x.com', product: 'invalid', score: 'hot' }
      ]});
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.errors).toHaveLength(2);
  });

  test('rejects more than 500 rows', async () => {
    const leads = Array.from({ length: 501 }, (_, i) => ({
      name: `Lead ${i}`, email: `l${i}@x.com`, product: 'website', score: 'hot'
    }));
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${process.env.ADMIN_TOKEN}`)
      .send({ leads });
    expect(res.status).toBe(400);
  });

  test('requires auth', async () => {
    const res = await request(app)
      .post('/api/leads/import')
      .send({ leads: [] });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/leads/:id/pipeline-status', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app)
      .patch('/api/leads/test-id/pipeline-status')
      .send({ pipeline_status: 'Contacted' });
    expect(res.status).toBe(401);
  });

  test('returns 404 if lead not found', async () => {
    const { getClient } = require('../src/db/client');
    getClient().execute.mockImplementationOnce(() => ({ rowsAffected: 0 }));
    const res = await request(app)
      .patch('/api/leads/missing/pipeline-status')
      .set('Authorization', 'Bearer test-token')
      .send({ pipeline_status: 'Contacted' });
    expect(res.status).toBe(404);
  });

  test('updates pipeline status with valid label', async () => {
    const { getClient } = require('../src/db/client');
    getClient().execute.mockImplementationOnce(() => ({ rowsAffected: 1 }));
    const res = await request(app)
      .patch('/api/leads/test-id/pipeline-status')
      .set('Authorization', 'Bearer test-token')
      .send({ pipeline_status: 'Meeting Done' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('accepts null to clear pipeline status', async () => {
    const { getClient } = require('../src/db/client');
    getClient().execute.mockImplementationOnce(() => ({ rowsAffected: 1 }));
    const res = await request(app)
      .patch('/api/leads/test-id/pipeline-status')
      .set('Authorization', 'Bearer test-token')
      .send({ pipeline_status: null });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/leads/stats — extended', () => {
  const { getClient } = require('../src/db/client');

  beforeEach(() => {
    getClient().execute.mockReset();
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/leads/stats');
    expect(res.status).toBe(401);
  });

  test('returns byDay field (renamed from leadsByDay)', async () => {
    getClient().execute.mockImplementation(({ sql }) => {
      if (/COUNT.*FROM leads(?!_)/i.test(sql) && !/score/i.test(sql) && !/pipeline_status/i.test(sql)) {
        return { rows: [{ count: 10 }] };
      }
      if (/score = 'hot'/.test(sql)) return { rows: [{ count: 3 }] };
      if (/score = 'warm'/.test(sql)) return { rows: [{ count: 4 }] };
      if (/score = 'cold'/.test(sql)) return { rows: [{ count: 3 }] };
      if (/GROUP BY date/i.test(sql)) {
        return { rows: [{ date: '2026-05-09', count: 5 }, { date: '2026-05-08', count: 5 }] };
      }
      if (/GROUP BY pipeline_status/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const res = await request(app).get('/api/leads/stats').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body.byDay).toBeDefined();
    expect(res.body.byDay).toHaveLength(2);
    expect(res.body.leadsByDay).toBeUndefined();
  });

  test('returns pipelineBreakdown with non-null statuses only, ordered DESC', async () => {
    getClient().execute.mockImplementation(({ sql }) => {
      if (/COUNT.*FROM leads(?!_)/i.test(sql) && !/score/i.test(sql) && !/pipeline_status/i.test(sql)) {
        return { rows: [{ count: 20 }] };
      }
      if (/score = 'hot'/.test(sql)) return { rows: [{ count: 8 }] };
      if (/score = 'warm'/.test(sql)) return { rows: [{ count: 7 }] };
      if (/score = 'cold'/.test(sql)) return { rows: [{ count: 5 }] };
      if (/GROUP BY date/i.test(sql)) return { rows: [] };
      if (/GROUP BY pipeline_status/i.test(sql)) {
        return {
          rows: [
            { label: 'Email Sent', count: 8 },
            { label: 'Meeting Done', count: 3 }
          ]
        };
      }
      return { rows: [] };
    });
    const res = await request(app).get('/api/leads/stats').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body.pipelineBreakdown).toEqual([
      { label: 'Email Sent', count: 8 },
      { label: 'Meeting Done', count: 3 }
    ]);
  });

  test('accepts from and to query parameters and passes them to query args', async () => {
    let capturedArgs = null;
    getClient().execute.mockImplementation((arg) => {
      if (typeof arg === 'object' && arg.sql && /BETWEEN/i.test(arg.sql)) {
        capturedArgs = arg.args;
      }
      if (typeof arg === 'object' && /COUNT.*FROM leads/i.test(arg.sql) && !/score/i.test(arg.sql) && !/pipeline_status/i.test(arg.sql)) {
        return { rows: [{ count: 5 }] };
      }
      return { rows: [] };
    });
    const res = await request(app)
      .get('/api/leads/stats?from=2026-05-01&to=2026-05-09')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(capturedArgs).toEqual(['2026-05-01T00:00:00.000Z', '2026-05-09T23:59:59.999Z']);
  });
});

describe('POST /api/leads — fires notifyNewLead', () => {
  beforeEach(() => {
    mockNotifyNewLead.mockClear();
  });

  test('calls notifyNewLead after successful lead capture', async () => {
    const res = await request(app).post('/api/leads').send({
      sessionId: 'session-xyz',
      name: 'New Lead',
      email: 'new@example.com',
      product: 'ai_service'
    });
    expect(res.status).toBe(200);
    // Give the fire-and-forget call a tick to dispatch
    await new Promise(r => setTimeout(r, 10));
    expect(mockNotifyNewLead).toHaveBeenCalledTimes(1);
    const calledWith = mockNotifyNewLead.mock.calls[0][0];
    expect(calledWith.name).toBe('New Lead');
    expect(calledWith.email).toBe('new@example.com');
    expect(calledWith.score).toBeDefined();
  });

  test('returns 200 even if notifyNewLead rejects', async () => {
    mockNotifyNewLead.mockRejectedValueOnce(new Error('worker down'));
    const res = await request(app).post('/api/leads').send({
      sessionId: 'session-xyz',
      name: 'Resilient Lead',
      email: 'r@example.com',
      product: 'website'
    });
    expect(res.status).toBe(200);
  });
});
