const mockSendNotification = jest.fn().mockResolvedValue({});
const mockResendSend = jest.fn().mockResolvedValue({ id: 'resend-message-id' });
const mockExecute = jest.fn();

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn().mockReturnValue({ publicKey: 'pub', privateKey: 'priv' }),
  setVapidDetails: jest.fn(),
  sendNotification: mockSendNotification
}));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockResendSend }
  }))
}));

jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({ execute: mockExecute })
}));

const { notifyNewLead } = require('../src/services/notifications');

const sampleLead = {
  id: 'lead-uuid-1',
  name: 'Sarah Chen',
  email: 'sarah@example.com',
  phone: '+62811000000',
  product: 'ai_service',
  summary: 'Wants AI chatbot',
  bottlenecks: ['no time', 'no team'],
  score: 'hot',
  followup: 'Hi Sarah, great chat...',
  created_at: '2026-05-11T12:00:00Z'
};

function configRow(key, value) { return { key, value }; }

function mockConfigQuery(config) {
  mockExecute.mockImplementation(({ sql }) => {
    if (/FROM scraper_config/i.test(sql)) {
      return { rows: Object.entries(config).map(([k, v]) => configRow(k, v)) };
    }
    if (/FROM push_subscriptions/i.test(sql)) return { rows: [] };
    return { rows: [] };
  });
}

beforeEach(() => {
  mockExecute.mockReset();
  mockSendNotification.mockClear();
  mockResendSend.mockClear();
});

describe('notifyNewLead', () => {
  test('sends team email when notify_team_email=true and api key present', async () => {
    mockConfigQuery({
      resend_api_key: 'rk_test',
      resend_from_address: 'john.alexander@3dvisualpro.com',
      notify_team_email: 'true',
      notify_lead_confirmation: 'false',
      lead_confirmation_subject: 'x',
      lead_confirmation_body: 'x'
    });
    await notifyNewLead(sampleLead);
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockResendSend.mock.calls[0][0].to).toBe('john.alexander@3dvisualpro.com');
    expect(mockResendSend.mock.calls[0][0].subject).toMatch(/hot lead/i);
    expect(mockResendSend.mock.calls[0][0].subject).toMatch(/Sarah Chen/);
  });

  test('skips team email when notify_team_email=false', async () => {
    mockConfigQuery({
      resend_api_key: 'rk_test',
      resend_from_address: 'john.alexander@3dvisualpro.com',
      notify_team_email: 'false',
      notify_lead_confirmation: 'false',
      lead_confirmation_subject: 'x',
      lead_confirmation_body: 'x'
    });
    await notifyNewLead(sampleLead);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  test('skips team email when resend_api_key is empty', async () => {
    mockConfigQuery({
      resend_api_key: '',
      resend_from_address: 'x',
      notify_team_email: 'true',
      notify_lead_confirmation: 'true',
      lead_confirmation_subject: 'x',
      lead_confirmation_body: 'x'
    });
    await notifyNewLead(sampleLead);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  test('sends lead confirmation with {{name}} substituted', async () => {
    mockConfigQuery({
      resend_api_key: 'rk_test',
      resend_from_address: 'sender@example.com',
      notify_team_email: 'false',
      notify_lead_confirmation: 'true',
      lead_confirmation_subject: 'Hi {{name}}',
      lead_confirmation_body: '<p>Hello {{name}}, thanks!</p>'
    });
    await notifyNewLead(sampleLead);
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const call = mockResendSend.mock.calls[0][0];
    expect(call.to).toBe('sarah@example.com');
    expect(call.subject).toBe('Hi Sarah Chen');
    expect(call.html).toBe('<p>Hello Sarah Chen, thanks!</p>');
  });

  test('skips lead confirmation when email is invalid', async () => {
    mockConfigQuery({
      resend_api_key: 'rk_test',
      resend_from_address: 'sender@example.com',
      notify_team_email: 'false',
      notify_lead_confirmation: 'true',
      lead_confirmation_subject: 'Hi {{name}}',
      lead_confirmation_body: 'Hi {{name}}'
    });
    const badLead = { ...sampleLead, email: 'no-at-sign' };
    await notifyNewLead(badLead);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  test('sends web push to all subscriptions', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM scraper_config/i.test(sql)) {
        return { rows: [
          configRow('resend_api_key', ''),
          configRow('notify_team_email', 'false'),
          configRow('notify_lead_confirmation', 'false')
        ]};
      }
      if (/FROM push_subscriptions/i.test(sql)) {
        return { rows: [
          { id: 's1', endpoint: 'https://push.example/1', p256dh_key: 'k1', auth_key: 'a1' },
          { id: 's2', endpoint: 'https://push.example/2', p256dh_key: 'k2', auth_key: 'a2' }
        ]};
      }
      return { rows: [] };
    });
    await notifyNewLead(sampleLead);
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(payload.title).toMatch(/hot lead/i);
    expect(payload.body).toContain('Sarah Chen');
    expect(payload.url).toContain('lead-uuid-1');
  });

  test('deletes expired subscription on 410 Gone', async () => {
    let deleteCalled = false;
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM scraper_config/i.test(sql)) {
        return { rows: [
          configRow('resend_api_key', ''),
          configRow('notify_team_email', 'false'),
          configRow('notify_lead_confirmation', 'false')
        ]};
      }
      if (/DELETE FROM push_subscriptions/i.test(sql)) {
        deleteCalled = true;
        return { rowsAffected: 1 };
      }
      if (/FROM push_subscriptions/i.test(sql)) {
        return { rows: [
          { id: 's1', endpoint: 'https://push.example/expired', p256dh_key: 'k', auth_key: 'a' }
        ]};
      }
      return { rows: [] };
    });
    mockSendNotification.mockRejectedValueOnce({ statusCode: 410 });
    await notifyNewLead(sampleLead);
    expect(deleteCalled).toBe(true);
  });

  test('one worker failing does not prevent the others', async () => {
    mockExecute.mockImplementation(({ sql }) => {
      if (/FROM scraper_config/i.test(sql)) {
        return { rows: [
          configRow('resend_api_key', 'rk_test'),
          configRow('resend_from_address', 'sender@example.com'),
          configRow('notify_team_email', 'true'),
          configRow('notify_lead_confirmation', 'true'),
          configRow('lead_confirmation_subject', 'Hi {{name}}'),
          configRow('lead_confirmation_body', 'Hi {{name}}')
        ]};
      }
      if (/FROM push_subscriptions/i.test(sql)) {
        return { rows: [{ id: 's1', endpoint: 'https://push.example/1', p256dh_key: 'k', auth_key: 'a' }] };
      }
      return { rows: [] };
    });
    mockSendNotification.mockRejectedValueOnce(new Error('push failed'));
    await notifyNewLead(sampleLead);
    expect(mockResendSend).toHaveBeenCalledTimes(2);
  });
});
