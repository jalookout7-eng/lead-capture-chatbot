const express = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const { getClient } = require('../db/client');
const ai = require('../services/ai');

const { getActiveIntelligenceVersion, buildSystemPrompt } = require('../services/intelligence');

const router = express.Router();

const CORE_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'aria-core-prompt.md'),
  'utf8'
);

async function resolveSystemPrompt() {
  const active = await getActiveIntelligenceVersion();
  return buildSystemPrompt(CORE_PROMPT, active);
}

router.post('/', async (req, res) => {
  const { sessionId, message } = req.body;
  if (typeof message !== 'string') {
    return res.status(400).json({ error: 'message must be a string' });
  }
  const trimmedMessage = message.trim();

  try {
    const client = getClient();
    const now = new Date().toISOString();
    let sid = sessionId;
    let messages = [];

    if (!sid) {
      // New session
      sid = randomUUID();
      const systemPrompt = await resolveSystemPrompt();
      messages = [{ role: 'system', content: systemPrompt }];
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
    const cleanReply = reply.replace(/\bCAPTURE_READY\b/g, '').trim();

    // Detect product from AI signal (AI includes PRODUCT:<type> when routing)
    const productMatch = reply.match(/PRODUCT:(ai_service|website|marketing|consultancy|crm|other)/);
    const product = productMatch ? productMatch[1] : null;
    const cleanReply2 = cleanReply.replace(/(?:\r?\n|^)PRODUCT:(?:ai_service|website|marketing|consultancy|crm|other)\r?\n?/gm, '').trim();

    // Append assistant reply (stripped of signals)
    messages.push({ role: 'assistant', content: cleanReply2 });

    // Count user messages to determine stage
    const userMsgCount = messages.filter(m => m.role === 'user').length;
    const stage = captureReady ? 'capture' : userMsgCount >= 2 ? 'discovery' : 'greeting';

    // Persist updated messages — all sessions saved regardless of lead capture
    await client.execute({
      sql: 'UPDATE chat_sessions SET messages = ?, updated_at = ? WHERE id = ?',
      args: [JSON.stringify(messages), now, sid]
    });

    res.json({ sessionId: sid, reply: cleanReply2, stage, captureReady, product });
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
