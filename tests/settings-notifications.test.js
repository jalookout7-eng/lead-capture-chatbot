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

describe('GET /api/settings/notifications', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/settings/notifications');
    expect(res.status).toBe(401);
  });

  test('returns masked config (resend_api_key_set boolean, no raw key)', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        { key: 'resend_api_key', value: 'rk_test_secret' },
        { key: 'resend_from_address', value: 'john@example.com' },
        { key: 'notify_team_email', value: 'true' },
        { key: 'notify_lead_confirmation', value: 'false' },
        { key: 'lead_confirmation_subject', value: 'Hi {{name}}' },
        { key: 'lead_confirmation_body', value: '<p>Hi {{name}}</p>' }
      ]
    });
    const res = await request(app).get('/api/settings/notifications').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.config.resend_api_key_set).toBe(true);
    expect(res.body.config.resend_api_key).toBeUndefined();
    expect(res.body.config.resend_from_address).toBe('john@example.com');
    expect(res.body.config.notify_team_email).toBe(true);
    expect(res.body.config.notify_lead_confirmation).toBe(false);
    expect(res.body.config.lead_confirmation_subject).toBe('Hi {{name}}');
  });

  test('returns resend_api_key_set=false when key is empty', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ key: 'resend_api_key', value: '' }]
    });
    const res = await request(app).get('/api/settings/notifications').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.config.resend_api_key_set).toBe(false);
  });
});

describe('PATCH /api/settings/notifications', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app)
      .patch('/api/settings/notifications')
      .send({ notify_team_email: false });
    expect(res.status).toBe(401);
  });

  test('updates boolean keys (stored as string)', async () => {
    const writes = [];
    mockExecute.mockImplementation(({ sql, args }) => {
      if (/INSERT INTO scraper_config/i.test(sql)) writes.push(args);
      return { rowsAffected: 1 };
    });
    const res = await request(app)
      .patch('/api/settings/notifications')
      .set(authHeader)
      .send({ notify_team_email: false, notify_lead_confirmation: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const writtenKeys = writes.map(a => a[0]);
    expect(writtenKeys).toContain('notify_team_email');
    expect(writtenKeys).toContain('notify_lead_confirmation');
    const teamWrite = writes.find(a => a[0] === 'notify_team_email');
    expect(teamWrite[1]).toBe('false');
  });

  test('returns 400 if resend_api_key is set to empty string', async () => {
    const res = await request(app)
      .patch('/api/settings/notifications')
      .set(authHeader)
      .send({ resend_api_key: '' });
    expect(res.status).toBe(400);
  });

  test('accepts resend_api_key with a real value', async () => {
    mockExecute.mockResolvedValue({ rowsAffected: 1 });
    const res = await request(app)
      .patch('/api/settings/notifications')
      .set(authHeader)
      .send({ resend_api_key: 'rk_new_secret' });
    expect(res.status).toBe(200);
  });

  test('updates string keys (subject/body)', async () => {
    const writes = [];
    mockExecute.mockImplementation(({ sql, args }) => {
      if (/INSERT INTO scraper_config/i.test(sql)) writes.push(args);
      return { rowsAffected: 1 };
    });
    const res = await request(app)
      .patch('/api/settings/notifications')
      .set(authHeader)
      .send({
        lead_confirmation_subject: 'Hello {{name}}',
        lead_confirmation_body: '<p>Welcome {{name}}</p>'
      });
    expect(res.status).toBe(200);
    const subjectWrite = writes.find(a => a[0] === 'lead_confirmation_subject');
    expect(subjectWrite[1]).toBe('Hello {{name}}');
  });

  test('ignores unknown keys (no error, no write)', async () => {
    const writes = [];
    mockExecute.mockImplementation(({ sql, args }) => {
      if (/INSERT INTO scraper_config/i.test(sql)) writes.push(args);
      return { rowsAffected: 1 };
    });
    const res = await request(app)
      .patch('/api/settings/notifications')
      .set(authHeader)
      .send({ malicious_key: 'evil', notify_team_email: true });
    expect(res.status).toBe(200);
    const writtenKeys = writes.map(a => a[0]);
    expect(writtenKeys).not.toContain('malicious_key');
  });
});
