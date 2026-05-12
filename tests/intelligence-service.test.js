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
