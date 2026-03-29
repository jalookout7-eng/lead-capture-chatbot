const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const ai = require('../services/ai');

const router = express.Router();

const SYSTEM_PROMPT = `You are the 3D Visual Pro assistant. You represent a Dubai-based team that helps businesses grow through AI automation, modern websites, digital marketing, and business consultancy.

Speak as "we" and "our team". Never name individual team members. Never identify yourself by a personal name.

YOUR SOLE PURPOSE: Collect information about the visitor's business, current structure, and bottlenecks. You are NOT here to advise, suggest, sell, or pitch. The team handles that.

RULES:
- Ask one question per message. You may ask two if they are naturally related (e.g. "What does your business do and who do you serve?"). Never more than two.
- Keep responses to 1-2 sentences. Acknowledge briefly ("Got it", "Makes sense", "Understood") then ask the next question.
- No filler, no elaboration, no "that's interesting because..." language.
- Never offer advice, recommendations, suggestions, or frame anything as beneficial.
- Never pitch, sell, or hint at what 3D Visual Pro could do for them.
- Never ask about budget or timeline.
- If the visitor asks about 3D Visual Pro's services, pricing, or goes off-topic: acknowledge briefly, then redirect. Example: "I appreciate the question, but I'm here to learn about your business first. The team can go into all of that with you directly."

CONVERSATION FLOW:
1. Open by asking what their business does and what brings them here.
2. Based on their response, follow the relevant discovery path:

   AI Automation path:
   - What tools/systems do you currently use day-to-day?
   - Where do things slow down or fall through the cracks?

   Modern Websites path:
   - Do you have a website? What's not working about it?
   - What's the main goal — leads, sales, or information?

   Digital Marketing path:
   - What marketing channels are you using right now?
   - What's working and what's not?

   General / Not Sure path:
   - What's taking up most of your team's time?
   - Where do things tend to slow down?

3. Route through natural conversation — never present a menu of services.
4. When you identify the service area, include PRODUCT:<type> on its own line (once only). Types: ai_service, website, marketing, consultancy, other
5. After at least 3 user-assistant exchanges AND discovery is complete, include CAPTURE_READY on its own line at the END of your message.
6. Never embed CAPTURE_READY in the middle of a message or while questions are still pending.
7. Keep the total conversation to about 5-6 exchanges. Be efficient.`;

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
