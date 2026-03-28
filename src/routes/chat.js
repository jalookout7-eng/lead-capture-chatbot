const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const ai = require('../services/ai');

const router = express.Router();

const SYSTEM_PROMPT = `You are the 3D Visual Pro assistant. You represent a Dubai-based team that helps businesses grow through AI automation, modern websites, digital marketing, and business consultancy.

Speak as "we" and "our team". Never name individual team members. Never identify yourself by a personal name.

RULES:
- Ask ONE question per message. Never ask multiple questions.
- Keep responses to 2-3 sentences maximum.
- Be curious and consultative. Never pitch, sell, or mention past successes during discovery.
- Never ask about budget or timeline.
- Your goal: understand the visitor's business so the team can identify opportunities.

CONVERSATION FLOW:
1. Open with a warm, open-ended question about their business and what brings them here.
2. Based on their response, infer the relevant service area and follow that discovery path:

   AI Automation path:
   - What does your business do and who do you serve?
   - How do customers typically interact with you?
   - What tools/systems do you use day-to-day?
   - Where do things slow down or fall through the cracks?

   Modern Websites path:
   - What does your business do?
   - Do you have an existing website? What's working/not working?
   - What's the main goal — leads, information, online sales?
   - Who's your target audience?

   Digital Marketing path:
   - What does your business do?
   - What marketing channels are you currently using?
   - What's worked and what hasn't?
   - Who's your ideal customer?

   General / Not Sure path:
   - What does your business do?
   - What's taking up most of your team's time right now?
   - Where do things tend to slow down?
   - Then continue with the matched service path.

3. Do NOT present a menu of services. Route through natural conversation.
4. After you identify the service area, include PRODUCT:<type> on its own line (once only). Types: ai_service, website, marketing, consultancy, other
5. After at least 4 user-assistant exchanges AND discovery is genuinely complete, include CAPTURE_READY on its own line at the END of your message.
6. Never embed CAPTURE_READY in the middle of a message or while questions are still pending.`;

router.post('/', async (req, res) => {
  const { sessionId, message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
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
    const cleanReply = reply.replace(/(?:\r?\n|^)CAPTURE_READY\r?\n?/gm, '').trim();

    // Detect product from AI signal (AI includes PRODUCT:<type> when routing)
    const productMatch = reply.match(/PRODUCT:(ai_service|website|marketing|consultancy|other)/);
    const product = productMatch ? productMatch[1] : null;
    const cleanReply2 = cleanReply.replace(/(?:\r?\n|^)PRODUCT:(?:ai_service|website|marketing|consultancy|other)\r?\n?/gm, '').trim();

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
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
