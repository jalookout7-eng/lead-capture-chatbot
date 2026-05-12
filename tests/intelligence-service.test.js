const mockExecute = jest.fn();
jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({ execute: mockExecute })
}));

const { getActiveIntelligenceVersion, invalidateCache } = require('../src/services/intelligence');

beforeEach(() => {
  mockExecute.mockReset();
  invalidateCache();
});

describe('getActiveIntelligenceVersion', () => {
  test('loads active version from DB on first call', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{
        id: 'v1', version_number: 1,
        lessons_learned: '', scoring_rules: '{"weights":{},"thresholds":{"hot":25,"warm":10},"signals":{"hot_signals":[],"warm_signals":[],"cold_signals":[]}}',
        changelog: '', core_hash: 'abc', status: 'active', source: 'seed',
        created_at: '2026-05-12T00:00:00Z', published_at: '2026-05-12T00:00:00Z', published_by: 'migration'
      }]
    });
    const v = await getActiveIntelligenceVersion();
    expect(v.version_number).toBe(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('returns cached value on second call within 60s', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ id: 'v1', version_number: 1, lessons_learned: '', scoring_rules: '{}', core_hash: 'a', status: 'active' }]
    });
    await getActiveIntelligenceVersion();
    await getActiveIntelligenceVersion();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('invalidateCache forces re-fetch', async () => {
    mockExecute.mockResolvedValue({
      rows: [{ id: 'v1', version_number: 1, lessons_learned: '', scoring_rules: '{}', core_hash: 'a', status: 'active' }]
    });
    await getActiveIntelligenceVersion();
    invalidateCache();
    await getActiveIntelligenceVersion();
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  test('returns null when no active version exists', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const v = await getActiveIntelligenceVersion();
    expect(v).toBeNull();
  });
});

const { buildSystemPrompt, buildQualifierPrompt } = require('../src/services/intelligence');

describe('buildSystemPrompt', () => {
  test('returns locked core only when no active version', () => {
    const out = buildSystemPrompt('CORE_PROMPT_TEXT', null);
    expect(out).toBe('CORE_PROMPT_TEXT');
  });

  test('appends LESSONS LEARNED block when lessons exist', () => {
    const version = {
      version_number: 3,
      lessons_learned: 'When the visitor mentions urgency, dig into the deadline.',
      scoring_rules: JSON.stringify({
        weights: {}, thresholds: { hot: 25, warm: 10 },
        signals: { hot_signals: ['budget mentioned'], warm_signals: [], cold_signals: [] }
      })
    };
    const out = buildSystemPrompt('CORE', version);
    expect(out).toMatch(/CORE/);
    expect(out).toMatch(/LESSONS LEARNED \(active intelligence v3\)/);
    expect(out).toMatch(/When the visitor mentions urgency/);
    expect(out).toMatch(/SCORING HINTS/);
    expect(out).toMatch(/Hot signals: budget mentioned/);
  });

  test('omits LESSONS LEARNED block when lessons_learned is empty', () => {
    const version = {
      version_number: 1,
      lessons_learned: '',
      scoring_rules: JSON.stringify({
        weights: {}, thresholds: { hot: 25, warm: 10 },
        signals: { hot_signals: [], warm_signals: [], cold_signals: [] }
      })
    };
    const out = buildSystemPrompt('CORE', version);
    expect(out).not.toMatch(/LESSONS LEARNED/);
    expect(out).toMatch(/SCORING HINTS/);
  });
});

describe('buildQualifierPrompt', () => {
  test('renders weights table and thresholds and asks for signals_observed', () => {
    const rules = {
      weights: { budget_mentioned: 10, no_budget_context: -5 },
      thresholds: { hot: 25, warm: 10 },
      signals: { hot_signals: ['budget'], warm_signals: [], cold_signals: [] }
    };
    const out = buildQualifierPrompt(rules);
    expect(out).toMatch(/budget_mentioned\s*\|\s*\+?10/);
    expect(out).toMatch(/no_budget_context\s*\|\s*-5/);
    expect(out).toMatch(/hot.*25/);
    expect(out).toMatch(/warm.*10/);
    expect(out).toMatch(/signals_observed/);
    expect(out).toMatch(/summary/);
    expect(out).toMatch(/bottlenecks/);
    expect(out).toMatch(/followup/);
  });
});
