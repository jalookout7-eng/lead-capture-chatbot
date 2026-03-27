const Groq = require('groq-sdk');

let _groqClient;

function getGroqClient() {
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: process.env.AI_API_KEY });
  }
  return _groqClient;
}

const PROVIDERS = {
  groq: async (messages) => {
    const groq = getGroqClient();
    const res = await groq.chat.completions.create({
      model: process.env.AI_MODEL || 'llama-3.1-8b-instant',
      messages,
    });
    return res.choices[0].message.content;
  },

  // Add new providers here — same signature, same return type
  // openai: async (messages) => { ... },
  // anthropic: async (messages) => { ... },
};

async function complete(messages) {
  const provider = process.env.AI_PROVIDER || 'groq';
  const adapter = PROVIDERS[provider];
  if (!adapter) throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  return adapter(messages);
}

module.exports = { complete };
