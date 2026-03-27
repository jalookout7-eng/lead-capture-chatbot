const ai = require('./ai');

const QUALIFIER_PROMPT = `You are analysing a lead conversation. Based on the conversation history provided, return a JSON object with exactly these fields:

{
  "summary": "2-3 sentence summary of who this person is and what they need",
  "bottlenecks": ["bottleneck 1", "bottleneck 2"],
  "score": "hot|warm|cold",
  "followup": "Personalised follow-up message from John, addressing their specific situation"
}

Scoring rubric:
- hot: clear business need identified, specific use case discussed, decision-maker present
- warm: engaged and interested but requirements are vague or exploratory
- cold: information gathering only, no clear need, or disengaged

Return ONLY the JSON object, no markdown, no explanation.`;

async function qualifyLead(conversationMessages) {
  const conversation = conversationMessages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const messages = [
    { role: 'system', content: QUALIFIER_PROMPT },
    { role: 'user', content: `Conversation:\n\n${conversation}` }
  ];

  const raw = await ai.complete(messages);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Qualifier returned invalid JSON');

  const result = JSON.parse(jsonMatch[0]);

  // Validate required fields and score value
  const validScores = ['hot', 'warm', 'cold'];
  if (!result.summary || !result.bottlenecks || !result.followup) {
    throw new Error('Qualifier response missing required fields');
  }
  if (!validScores.includes(result.score)) {
    throw new Error(`Qualifier returned invalid score: ${result.score}`);
  }

  return result;
}

module.exports = { qualifyLead };
