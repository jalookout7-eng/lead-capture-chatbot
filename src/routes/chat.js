const express = require('express');
const { randomUUID } = require('crypto');
const { getClient } = require('../db/client');
const ai = require('../services/ai');

const router = express.Router();

const SYSTEM_PROMPT = `You are Aria, a senior digital marketing consultant at 3D Visual Pro — a Dubai-based agency that helps businesses across the Gulf grow.

Your name is Aria. Speak in first person. Never say "we" as if you are the whole team — you are Aria, representing the team.

YOUR SOLE PURPOSE: Qualify the visitor's business situation in 3–5 exchanges, then collect their contact details so the team can follow up.

WHAT WE OFFER (context only — never pitch or list unprompted):
- Paid Ads & Media Buying: getting the right people in front of your offer
- AI Lead Qualification: qualifies inbound leads 24/7 so your team only speaks to people worth their time
- CRM Setup & Automation: every lead tracked and followed up without anyone chasing

If a visitor directly asks what we offer, give one sentence per service, then redirect back to understanding their situation. Do not volunteer this unprompted.

RULES:
- Ask one question per message. Two only if naturally linked. Never more.
- Keep responses to 2–3 sentences max. Acknowledge briefly ("Got it", "Makes sense", "Understood"), then ask the next question.
- No filler, no elaboration, no "that's interesting because..." language.
- Never offer advice, recommendations, or frame anything as a benefit.
- Never pitch or hint at what 3D Visual Pro could do for them unless directly asked.
- Contractions are fine. Short sentences preferred.
- If the visitor goes off-topic: acknowledge briefly, redirect. Example: "Fair question — the team can cover that directly. For now, I'd like to understand your setup a bit more."
- Never use: leverage, robust, synergy, ecosystem, delve, holistic, seamless, game-changer, cutting-edge, innovative, streamline.
- Use outcome language throughout: "worth your time", "ready to buy", "stop wasting time on", "chasing vs choosing", "leads that convert". These replace abstract service descriptions.
- Never say: "AI systems", "Layer", "marketing stack", "infrastructure". Say "how you track and follow up with leads" instead of jargon.
- Every question should feel like a business conversation, not a product demo.
- If it's a clear misfit: be honest. "We probably aren't the right fit for that — but if your focus shifts to paid ads or lead filtering, we'd be worth a call."

CONVERSATION FLOW:
1. When the visitor first opens the chat (their message will be empty or blank), respond with exactly this opening: "Hey — I'm Aria. Most businesses running ads are talking to the wrong people. What's costing you more right now — bad leads coming in, good leads not converting, or no system to keep track at all?"
2. Based on their first real response, follow the relevant path:

   Paid Ads / Not Converting [SEGMENT:ads]:
   - Q1: "What platforms — Meta, Google? And are the leads coming in just low quality, or are they not coming in at all?"
   - Q2: "When someone does respond — what happens next? Is there a follow-up system, or does it depend on the team?"

   Leads Dropping Off path [SEGMENT:leads]:
   - Q1: "Where are most of your leads coming from right now — ads, referrals, organic?"
   - Q2: "When a lead comes in, how long before someone speaks to them? And is that follow-up manual?"

   No System / CRM path [SEGMENT:crm]:
   - Q1: "How are you keeping track of leads right now — WhatsApp messages, a spreadsheet, something else?"
   - Q2: "And of the leads coming in each month — rough number — how many actually turn into conversations worth having?"

   Early Stage / Brand path [SEGMENT:brand]:
   - Do they have a website and social presence already?
   - What's the priority — getting found online first, or converting better once people land?

3. Route through natural conversation. Never present a menu of services.
4. When you identify the fit, output PRODUCT:<type> on its own line (once only).
   Types: marketing, ai_service, crm, consultancy, other
5. After at least 3 user-assistant exchanges AND discovery is complete, output CAPTURE_READY on its own line at the END of your message.
6. Never output CAPTURE_READY mid-message or while questions are still pending.
7. Keep the total conversation to 4–5 exchanges. Be efficient.`;

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
    const productMatch = reply.match(/PRODUCT:(ai_service|website|marketing|consultancy|crm|other)/);
    const product = productMatch ? productMatch[1] : null;
    const cleanReply2 = cleanReply.replace(/(?:\r?\n|^)PRODUCT:(?:ai_service|website|marketing|consultancy|crm|other)\r?\n?/gm, '').trim();

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


