// Mock the groq SDK before requiring ai.js
jest.mock('groq-sdk', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Hello from Groq' } }]
        })
      }
    }
  }));
});

process.env.AI_PROVIDER = 'groq';
process.env.AI_MODEL = 'llama-3.1-8b-instant';
process.env.AI_API_KEY = 'test-key';

const ai = require('../src/services/ai');

test('ai.complete returns a string response', async () => {
  const result = await ai.complete([
    { role: 'user', content: 'Hello' }
  ]);
  expect(typeof result).toBe('string');
  expect(result.length).toBeGreaterThan(0);
});

test('ai.complete passes messages to provider', async () => {
  const messages = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hi' }
  ];
  const result = await ai.complete(messages);
  expect(result).toBe('Hello from Groq');
});

test('ai.complete throws on unknown provider', async () => {
  const originalProvider = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'unsupported';
  await expect(ai.complete([{ role: 'user', content: 'Hi' }]))
    .rejects.toThrow('Unknown AI_PROVIDER: unsupported');
  process.env.AI_PROVIDER = originalProvider;
});
