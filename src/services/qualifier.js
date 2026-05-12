const ai = require('./ai');
const { getActiveIntelligenceVersion, buildQualifierPrompt } = require('./intelligence');

const FALLBACK_RULES = {
  weights: {
    budget_mentioned: 10, specific_pain_point: 8, decision_maker_present: 12,
    specific_timeline: 8, asking_about_pricing: 5, ready_to_start_immediately: 15,
    no_budget_context: -5, just_browsing: -10
  },
  thresholds: { hot: 25, warm: 10 },
  signals: {
    hot_signals: ['mentions specific budget', 'deadline within 90 days', 'ready to start'],
    warm_signals: ['engaged and asking questions', 'exploring options', 'comparing vendors'],
    cold_signals: ['no budget context', 'no timeline given', 'vague need']
  }
};

async function qualifyLead(conversationMessages) {
  const active = await getActiveIntelligenceVersion();
  let rules = FALLBACK_RULES;
  if (active) {
    try { rules = JSON.parse(active.scoring_rules); } catch { /* fall through to defaults */ }
  }
  const qualifierPrompt = buildQualifierPrompt(rules);

  const conversation = conversationMessages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const messages = [
    { role: 'system', content: qualifierPrompt },
    { role: 'user', content: `Conversation:\n\n${conversation}` }
  ];

  const raw = await ai.complete(messages);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Qualifier returned invalid JSON');

  const result = JSON.parse(jsonMatch[0]);

  const validScores = ['hot', 'warm', 'cold'];
  if (!result.summary || !result.bottlenecks || !result.followup) {
    throw new Error('Qualifier response missing required fields');
  }
  if (!validScores.includes(result.score)) {
    throw new Error(`Qualifier returned invalid score: ${result.score}`);
  }

  return {
    summary: result.summary,
    bottlenecks: result.bottlenecks,
    score: result.score,
    followup: result.followup,
    signals_observed: Array.isArray(result.signals_observed) ? result.signals_observed : []
  };
}

module.exports = { qualifyLead };
