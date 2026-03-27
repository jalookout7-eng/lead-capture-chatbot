const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const ai = require('../services/ai');

const router = express.Router();

const SYSTEM_PROMPT = `You are a friendly, professional assistant for John's business. John offers:
- AI systems & automation for businesses (chatbots, lead capture, workflows)
- Modern websites & landing pages (fast build, 1-day delivery after needs audit)
- Real Estate Administration Handbook (for people entering real estate)
- Other AI-related products and services

Your role is to warmly engage visitors, understand their interest, and guide them through a natural conversation.

For business/AI service leads: ask open questions to understand their business model, team structure, current tools, and day-to-day operations. Your goal is to identify bottlenecks yourself — do NOT ask about budget or timelines.

For website leads: understand what they need and what their business does.

For product leads (Real Estate etc.): understand their current situation and goals.

After gathering enough context (typically 4-6 exchanges), collect their name and email naturally.

Once you identify the visitor's product interest, include "PRODUCT:ai_service", "PRODUCT:real_estate", "PRODUCT:website", or "PRODUCT:other" on its own line in your first relevant reply (only once).

When you have gathered sufficient context and are ready to collect contact details, include the exact text "CAPTURE_READY" on its own line at the end of your message.`;

router.post('/', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const client = getClient();
  const now = new Date().toISOString();
  let sid = sessionId;
  let messages = [];

  if (!sid) {
    // New session
    sid = randomUUID();
    messages = [{ role: 'system', content: SYSTEM_PROMPT }];
    await client.execute({
      sql: 'INSERT INTO chat_sessions (id, lead_id, messages, created_at, updated_at) VALUES (?, NULL, ?, ?, ?)',
      args: [sid, JSON.stringify(messages), now, now]
    });
  } else {
    // Load existing session
    const result = await client.execute({
      sql: 'SELECT messages FROM chat_sessions WHERE id = ?',
      args: [sid]
    });
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Session not found' });
    }
    messages = JSON.parse(result.rows[0].messages);
  }

  // Append user message
  messages.push({ role: 'user', content: message });

  // Get AI reply
  const reply = await ai.complete(messages);

  // Check if AI signalled capture readiness
  const captureReady = reply.includes('CAPTURE_READY');
  const cleanReply = reply.replace(/\nCAPTURE_READY\n?/g, '').trim();

  // Detect product from AI signal (AI includes PRODUCT:<type> when routing)
  const productMatch = reply.match(/PRODUCT:(ai_service|real_estate|website|other)/);
  const product = productMatch ? productMatch[1] : null;
  const cleanReply2 = cleanReply.replace(/\nPRODUCT:\S+\n?/g, '').trim();

  // Append assistant reply (stripped of signals)
  messages.push({ role: 'assistant', content: cleanReply2 });

  // Count user messages to determine stage
  const userMsgCount = messages.filter(m => m.role === 'user').length;
  const stage = captureReady ? 'capture' : userMsgCount >= 2 ? 'discovery' : 'greeting';

  // Persist updated messages
  await client.execute({
    sql: 'UPDATE chat_sessions SET messages = ?, updated_at = ? WHERE id = ?',
    args: [JSON.stringify(messages), now, sid]
  });

  res.json({ sessionId: sid, reply: cleanReply2, stage, captureReady, product });
});

module.exports = router;
