const { getClient } = require('../db/client');

const CACHE_TTL_MS = 60_000;
let cachedActive = null;
let cachedAt = 0;

async function getActiveIntelligenceVersion() {
  if (cachedActive && Date.now() - cachedAt < CACHE_TTL_MS) return cachedActive;
  const client = getClient();
  const result = await client.execute({
    sql: 'SELECT * FROM intelligence_versions WHERE status = ? LIMIT 1',
    args: ['active']
  });
  cachedActive = result.rows[0] || null;
  cachedAt = Date.now();
  return cachedActive;
}

function invalidateCache() {
  cachedActive = null;
  cachedAt = 0;
}

function buildSystemPrompt(coreText, version) {
  if (!version) return coreText;
  const rules = safeParse(version.scoring_rules);
  const parts = [coreText];
  if (version.lessons_learned && version.lessons_learned.trim()) {
    parts.push(`\nLESSONS LEARNED (active intelligence v${version.version_number}):\n${version.lessons_learned}`);
  }
  const hot = (rules?.signals?.hot_signals || []).join(', ');
  const warm = (rules?.signals?.warm_signals || []).join(', ');
  const cold = (rules?.signals?.cold_signals || []).join(', ');
  parts.push(
    '\nSCORING HINTS:',
    'When qualifying, weight these signals:',
    `- Hot signals: ${hot}`,
    `- Warm signals: ${warm}`,
    `- Cold signals: ${cold}`
  );
  return parts.join('\n');
}

function buildQualifierPrompt(rules) {
  const weightLines = Object.entries(rules.weights || {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v]) => `${k} | ${v > 0 ? '+' : ''}${v}`)
    .join('\n');
  const hot = (rules?.signals?.hot_signals || []).join(', ');
  const warm = (rules?.signals?.warm_signals || []).join(', ');
  const cold = (rules?.signals?.cold_signals || []).join(', ');
  return `You are analysing a lead conversation for 3D Visual Pro.

Based on the conversation history provided, return a JSON object with exactly these fields:

{
  "summary": "2-3 sentence summary",
  "bottlenecks": ["bottleneck 1", "bottleneck 2"],
  "score": "hot|warm|cold",
  "followup": "Personalised follow-up message from the 3D Visual Pro team",
  "signals_observed": ["signal_key_1", "signal_key_2"]
}

Scoring weights (signal | weight):
${weightLines}

Thresholds: hot >= ${rules.thresholds.hot}, warm >= ${rules.thresholds.warm}, otherwise cold.

Example signals:
- Hot: ${hot}
- Warm: ${warm}
- Cold: ${cold}

In signals_observed, return only signal keys from the weights table above that you detected in this conversation.

Return ONLY the JSON object, no markdown, no explanation.`;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = { getActiveIntelligenceVersion, invalidateCache, buildSystemPrompt, buildQualifierPrompt };
