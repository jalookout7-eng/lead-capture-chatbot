# Lead Capture & Chatbot System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a privacy-first, production-grade AI lead capture system with a chatbot, admin PWA dashboard, and automated follow-up generation — deployed on Render with Turso as the database.

**Architecture:** Single Node.js + Express server serves both the API and static frontend files. Turso (hosted SQLite) stores all leads and chat sessions. A provider-agnostic AI service abstraction wraps Groq (default) so the model can be swapped via env vars with no code changes.

**Tech Stack:** Node.js, Express, Turso (`@libsql/client`), Groq SDK (`groq-sdk`), Jest + Supertest (tests), HTML + Tailwind CSS (CDN, frontend), PWA (manifest + service worker)

---

## File Map

| File | Responsibility |
|---|---|
| `src/server.js` | Express app setup, route registration, static file serving |
| `src/db/client.js` | Turso client singleton |
| `src/db/schema.sql` | `leads` and `chat_sessions` table definitions |
| `src/services/ai.js` | Provider-agnostic AI abstraction: `ai.complete(messages) => Promise<string>` |
| `src/services/qualifier.js` | Calls `ai.complete` with full conversation to produce `{summary, bottlenecks, score, followup}` |
| `src/routes/chat.js` | `POST /api/chat` — manages sessions, calls AI, returns reply + stage signals |
| `src/routes/leads.js` | `POST /api/leads`, `GET /api/leads`, `GET /api/leads/:id`, `PATCH /api/leads/:id/status`, `GET /api/stats`, `GET /api/export` |
| `src/routes/followup.js` | `POST /api/followup/:id` (regenerate), `PATCH /api/followup/:id` (edit/mark sent) |
| `src/middleware/auth.js` | Bearer token check for admin routes |
| `public/index.html` | Landing page with embedded chatbot widget |
| `public/widget.html` | Standalone floating widget demo page |
| `public/admin/index.html` | Admin PWA dashboard (sidebar, overview, leads, follow-ups, export) |
| `public/admin/manifest.json` | PWA manifest for installability |
| `public/sw.js` | Service worker — caches dashboard shell |
| `tests/ai.test.js` | Unit tests for `ai.js` adapter |
| `tests/chat.test.js` | Integration tests for `POST /api/chat` |
| `tests/leads.test.js` | Integration tests for all `/api/leads` routes |
| `tests/followup.test.js` | Integration tests for `/api/followup/:id` routes |
| `.env.example` | All required env vars documented |
| `HANDOVER.md` | Agent handover document — always kept up to date |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `src/server.js`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `HANDOVER.md`

- [ ] **Step 1: Initialise the project**

```bash
cd "Lead Capture and Chatbot (Privacy First)"
npm init -y
npm install express dotenv @libsql/client groq-sdk uuid
npm install --save-dev jest supertest
```

- [ ] **Step 2: Add test script to `package.json`**

Edit the `scripts` section:
```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "jest --runInBand"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Create `src/server.js`**

```js
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes (added in later tasks)

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
```

- [ ] **Step 4: Create `.env.example`**

```
AI_PROVIDER=groq
AI_MODEL=llama-3.1-8b-instant
AI_API_KEY=your_groq_api_key_here
TURSO_URL=libsql://your-db.turso.io
TURSO_TOKEN=your_turso_token_here
ADMIN_TOKEN=choose_a_strong_secret_here
PORT=3000
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
.env
.superpowers/
```

- [ ] **Step 6: Create `HANDOVER.md`**

```markdown
# Handover — Lead Capture & Chatbot System

## What This Is
John's production lead management system. Visitors chat with an AI that discovers their business needs, captures their details, and qualifies them. John manages leads via a PWA admin dashboard.

## Current Status
- [ ] Task 1: Project scaffold — IN PROGRESS

## Stack
- Node.js + Express (single server)
- Turso (hosted SQLite) — @libsql/client
- Groq + Llama 3.1 8B (swappable via AI_PROVIDER env var)
- HTML + Tailwind CSS (CDN)
- Deployed on Render, source on GitHub

## Key Files
- `src/server.js` — entry point
- `src/services/ai.js` — AI abstraction (swap provider here)
- `src/routes/` — all API routes
- `public/admin/index.html` — admin PWA dashboard
- `docs/superpowers/specs/2026-03-27-lead-capture-chatbot-design.md` — full spec
- `docs/superpowers/plans/2026-03-27-lead-capture-chatbot.md` — this plan

## Environment Variables
See `.env.example` — set these on Render before deploying.

## Running Locally
1. Copy `.env.example` to `.env` and fill in values
2. `npm install`
3. `npm run dev`
4. Open http://localhost:3000

## Running Tests
`npm test`
```

- [ ] **Step 7: Verify server starts**

```bash
cp .env.example .env
# Fill in at least PORT=3000 in .env
node src/server.js
```
Expected: `Server running on port 3000`

- [ ] **Step 8: Commit**

```bash
git init
git add package.json src/server.js .env.example .gitignore HANDOVER.md
git commit -m "feat: initial project scaffold"
```

---

## Task 2: Database Setup

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/client.js`

- [ ] **Step 1: Create `src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  product         TEXT NOT NULL,
  summary         TEXT,
  bottlenecks     TEXT,
  score           TEXT DEFAULT 'cold',
  followup        TEXT,
  followup_sent   INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'new',
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT REFERENCES leads(id),
  messages    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

- [ ] **Step 2: Create `src/db/client.js`**

```js
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

let _client;

function getClient() {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_TOKEN,
    });
  }
  return _client;
}

async function initDb() {
  const client = getClient();
  const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  );
  // Execute each statement separately
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
}

module.exports = { getClient, initDb };
```

- [ ] **Step 3: Call `initDb` on server startup — update `src/server.js`**

```js
require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDb } = require('./db/client');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  initDb()
    .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
    .catch(err => { console.error('DB init failed:', err); process.exit(1); });
}

module.exports = app;
```

- [ ] **Step 4: Verify DB connects**

```bash
npm run dev
```
Expected: `Server running on port 3000` with no DB errors. Check Turso dashboard to confirm tables exist.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.sql src/db/client.js src/server.js
git commit -m "feat: database setup with Turso and schema init"
```

---

## Task 3: AI Service Abstraction

**Files:**
- Create: `src/services/ai.js`
- Create: `tests/ai.test.js`

- [ ] **Step 1: Write failing test — `tests/ai.test.js`**

```js
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
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
npm test tests/ai.test.js
```
Expected: FAIL — `Cannot find module '../src/services/ai'`

- [ ] **Step 3: Create `src/services/ai.js`**

```js
const Groq = require('groq-sdk');

const PROVIDERS = {
  groq: async (messages) => {
    const groq = new Groq({ apiKey: process.env.AI_API_KEY });
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
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
npm test tests/ai.test.js
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/ai.js tests/ai.test.js
git commit -m "feat: AI provider abstraction with Groq adapter"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `src/middleware/auth.js`

- [ ] **Step 1: Create `src/middleware/auth.js`**

```js
function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

module.exports = { requireAuth };
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware/auth.js
git commit -m "feat: bearer token auth middleware"
```

---

## Task 5: Chat Route

**Files:**
- Create: `src/routes/chat.js`
- Create: `tests/chat.test.js`
- Modify: `src/server.js`

- [ ] **Step 1: Write failing tests — `tests/chat.test.js`**

```js
const request = require('supertest');

// Mock AI service
jest.mock('../src/services/ai', () => ({
  complete: jest.fn().mockResolvedValue('How can I help you today?')
}));

// Mock DB
jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({
    execute: jest.fn().mockResolvedValue({ rows: [] })
  })
}));

const app = require('../src/server');

describe('POST /api/chat', () => {
  test('returns 400 if message is missing', async () => {
    const res = await request(app).post('/api/chat').send({});
    expect(res.status).toBe(400);
  });

  test('creates new session when sessionId is null', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: null, message: 'Hello' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessionId');
    expect(res.body).toHaveProperty('reply');
    expect(res.body).toHaveProperty('stage');
    expect(res.body).toHaveProperty('captureReady');
  });

  test('reply is a non-empty string', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: null, message: 'Hello' });
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.reply.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test tests/chat.test.js
```
Expected: FAIL — `Cannot find module '../src/routes/chat'` (or similar)

- [ ] **Step 3: Create `src/routes/chat.js`**

```js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
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
    sid = uuidv4();
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
```

- [ ] **Step 4: Register route in `src/server.js`**

```js
require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDb } = require('./db/client');
const chatRoute = require('./routes/chat');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/chat', chatRoute);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  initDb()
    .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
    .catch(err => { console.error('DB init failed:', err); process.exit(1); });
}

module.exports = app;
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm test tests/chat.test.js
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/routes/chat.js src/server.js tests/chat.test.js
git commit -m "feat: POST /api/chat with session management and AI replies"
```

---

## Task 6: Qualifier Service

**Files:**
- Create: `src/services/qualifier.js`

- [ ] **Step 1: Create `src/services/qualifier.js`**

```js
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
  // Strip system prompt — only pass the actual conversation
  const conversation = conversationMessages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const messages = [
    { role: 'system', content: QUALIFIER_PROMPT },
    { role: 'user', content: `Conversation:\n\n${conversation}` }
  ];

  const raw = await ai.complete(messages);

  // Extract JSON robustly (AI sometimes wraps in markdown)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Qualifier returned invalid JSON');

  return JSON.parse(jsonMatch[0]);
}

module.exports = { qualifyLead };
```

- [ ] **Step 2: Commit**

```bash
git add src/services/qualifier.js
git commit -m "feat: AI lead qualifier service"
```

---

## Task 7: Leads Routes

**Files:**
- Create: `src/routes/leads.js`
- Create: `tests/leads.test.js`
- Modify: `src/server.js`

- [ ] **Step 1: Write failing tests — `tests/leads.test.js`**

```js
const request = require('supertest');

jest.mock('../src/services/qualifier', () => ({
  qualifyLead: jest.fn().mockResolvedValue({
    summary: 'Test summary',
    bottlenecks: ['bottleneck 1'],
    score: 'hot',
    followup: 'Hi there, great chatting with you!'
  })
}));

jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({
    execute: jest.fn().mockImplementation(({ sql }) => {
      if (sql.startsWith('SELECT') && sql.includes('leads')) {
        return { rows: [{ id: 'test-id', name: 'Jane', email: 'jane@test.com', product: 'ai_service', score: 'hot', status: 'new', created_at: new Date().toISOString(), followup_sent: 0 }] };
      }
      if (sql.startsWith('SELECT') && sql.includes('chat_sessions')) {
        return { rows: [{ messages: JSON.stringify([{ role: 'user', content: 'Hi' }]) }] };
      }
      return { rows: [] };
    })
  })
}));

process.env.ADMIN_TOKEN = 'test-token';
const app = require('../src/server');

describe('POST /api/leads', () => {
  test('returns 400 if required fields missing', async () => {
    const res = await request(app).post('/api/leads').send({ name: 'Jane' });
    expect(res.status).toBe(400);
  });

  test('creates lead and returns score and followup', async () => {
    const res = await request(app).post('/api/leads').send({
      sessionId: 'session-123',
      name: 'Jane Doe',
      email: 'jane@test.com',
      product: 'ai_service'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('score');
    expect(res.body).toHaveProperty('followup');
  });
});

describe('GET /api/leads', () => {
  test('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  test('returns leads array with valid token', async () => {
    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test tests/leads.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `src/routes/leads.js`**

```js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../db/client');
const { qualifyLead } = require('../services/qualifier');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/leads — capture lead and run AI qualification
router.post('/', async (req, res) => {
  const { sessionId, name, email, product } = req.body;
  if (!sessionId || !name || !email || !product) {
    return res.status(400).json({ error: 'sessionId, name, email, and product are required' });
  }

  const client = getClient();
  const now = new Date().toISOString();
  const id = uuidv4();

  // Load conversation from session
  const sessionResult = await client.execute({
    sql: 'SELECT messages FROM chat_sessions WHERE id = ?',
    args: [sessionId]
  });
  const messages = sessionResult.rows.length
    ? JSON.parse(sessionResult.rows[0].messages)
    : [];

  // Run AI qualification (synchronous — ~1-3s)
  const { summary, bottlenecks, score, followup } = await qualifyLead(messages);

  // Save lead
  await client.execute({
    sql: `INSERT INTO leads (id, name, email, product, summary, bottlenecks, score, followup, followup_sent, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'new', ?)`,
    args: [id, name, email, product, summary, JSON.stringify(bottlenecks), score, followup, now]
  });

  // Link session to lead
  await client.execute({
    sql: 'UPDATE chat_sessions SET lead_id = ? WHERE id = ?',
    args: [id, sessionId]
  });

  res.json({ id, score, followup });
});

// GET /api/leads — all leads (admin)
router.get('/', requireAuth, async (req, res) => {
  const client = getClient();
  const result = await client.execute('SELECT * FROM leads ORDER BY created_at DESC');
  res.json(result.rows);
});

// GET /api/stats — dashboard stats (admin)
router.get('/stats', requireAuth, async (req, res) => {
  const client = getClient();
  const total = await client.execute('SELECT COUNT(*) as count FROM leads');
  const hot = await client.execute("SELECT COUNT(*) as count FROM leads WHERE score = 'hot'");
  const warm = await client.execute("SELECT COUNT(*) as count FROM leads WHERE score = 'warm'");
  const cold = await client.execute("SELECT COUNT(*) as count FROM leads WHERE score = 'cold'");
  const byDay = await client.execute(
    "SELECT substr(created_at, 1, 10) as date, COUNT(*) as count FROM leads GROUP BY date ORDER BY date DESC LIMIT 30"
  );
  res.json({
    total: total.rows[0].count,
    hot: hot.rows[0].count,
    warm: warm.rows[0].count,
    cold: cold.rows[0].count,
    leadsByDay: byDay.rows
  });
});

// GET /api/export — CSV download (admin)
router.get('/export', requireAuth, async (req, res) => {
  const client = getClient();
  const result = await client.execute('SELECT * FROM leads ORDER BY created_at DESC');
  const headers = ['id', 'name', 'email', 'product', 'score', 'status', 'summary', 'followup', 'followup_sent', 'created_at'];
  const csv = [
    headers.join(','),
    ...result.rows.map(row =>
      headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',')
    )
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send(csv);
});

// GET /api/leads/:id — single lead with conversation (admin)
router.get('/:id', requireAuth, async (req, res) => {
  const client = getClient();
  const lead = await client.execute({
    sql: 'SELECT * FROM leads WHERE id = ?',
    args: [req.params.id]
  });
  if (!lead.rows.length) return res.status(404).json({ error: 'Not found' });
  const session = await client.execute({
    sql: 'SELECT messages FROM chat_sessions WHERE lead_id = ?',
    args: [req.params.id]
  });
  res.json({
    ...lead.rows[0],
    messages: session.rows.length ? JSON.parse(session.rows[0].messages) : []
  });
});

// PATCH /api/leads/:id/status — update status (admin)
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const valid = ['new', 'contacted', 'converted', 'closed'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }
  const client = getClient();
  await client.execute({
    sql: 'UPDATE leads SET status = ? WHERE id = ?',
    args: [status, req.params.id]
  });
  res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 4: Register routes in `src/server.js`**

```js
require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDb } = require('./db/client');
const chatRoute = require('./routes/chat');
const leadsRoute = require('./routes/leads');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/chat', chatRoute);
app.use('/api/leads', leadsRoute);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  initDb()
    .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
    .catch(err => { console.error('DB init failed:', err); process.exit(1); });
}

module.exports = app;
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm test tests/leads.test.js
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/leads.js src/server.js tests/leads.test.js
git commit -m "feat: leads routes — capture, list, stats, export, status update"
```

---

## Task 8: Follow-up Routes

**Files:**
- Create: `src/routes/followup.js`
- Create: `tests/followup.test.js`
- Modify: `src/server.js`

- [ ] **Step 1: Write failing tests — `tests/followup.test.js`**

```js
const request = require('supertest');

jest.mock('../src/services/qualifier', () => ({
  qualifyLead: jest.fn().mockResolvedValue({
    summary: 'S', bottlenecks: [], score: 'warm', followup: 'New followup message'
  })
}));

jest.mock('../src/db/client', () => ({
  initDb: jest.fn().mockResolvedValue(),
  getClient: jest.fn().mockReturnValue({
    execute: jest.fn().mockImplementation(({ sql }) => {
      if (sql && sql.includes('chat_sessions')) return { rows: [{ messages: '[]' }] };
      return { rows: [{ id: 'lead-1', followup: 'Old msg', followup_sent: 0 }] };
    })
  })
}));

process.env.ADMIN_TOKEN = 'test-token';
const app = require('../src/server');

describe('POST /api/followup/:id', () => {
  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/followup/lead-1');
    expect(res.status).toBe(401);
  });

  test('regenerates followup message', async () => {
    const res = await request(app)
      .post('/api/followup/lead-1')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('followup');
  });
});

describe('PATCH /api/followup/:id', () => {
  test('updates followup text and sent status', async () => {
    const res = await request(app)
      .patch('/api/followup/lead-1')
      .set('Authorization', 'Bearer test-token')
      .send({ followup: 'Updated message', sent: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test tests/followup.test.js
```
Expected: FAIL

- [ ] **Step 3: Create `src/routes/followup.js`**

```js
const express = require('express');
const { getClient } = require('../db/client');
const { qualifyLead } = require('../services/qualifier');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/followup/:id — regenerate follow-up message
router.post('/:id', requireAuth, async (req, res) => {
  const client = getClient();

  // Load conversation
  const session = await client.execute({
    sql: 'SELECT messages FROM chat_sessions WHERE lead_id = ?',
    args: [req.params.id]
  });
  const messages = session.rows.length ? JSON.parse(session.rows[0].messages) : [];

  const { followup } = await qualifyLead(messages);

  await client.execute({
    sql: 'UPDATE leads SET followup = ? WHERE id = ?',
    args: [followup, req.params.id]
  });

  res.json({ followup });
});

// PATCH /api/followup/:id — edit followup text or mark as sent
router.patch('/:id', requireAuth, async (req, res) => {
  const { followup, sent } = req.body;
  const client = getClient();

  if (followup !== undefined) {
    await client.execute({
      sql: 'UPDATE leads SET followup = ? WHERE id = ?',
      args: [followup, req.params.id]
    });
  }
  if (sent !== undefined) {
    await client.execute({
      sql: 'UPDATE leads SET followup_sent = ? WHERE id = ?',
      args: [sent ? 1 : 0, req.params.id]
    });
  }

  res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 4: Register route in `src/server.js`**

Add `const followupRoute = require('./routes/followup');` and `app.use('/api/followup', followupRoute);` after the other routes.

- [ ] **Step 5: Run tests — confirm they pass**

```bash
npm test tests/followup.test.js
```
Expected: PASS

- [ ] **Step 6: Run all tests**

```bash
npm test
```
Expected: All suites PASS

- [ ] **Step 7: Commit**

```bash
git add src/routes/followup.js src/server.js tests/followup.test.js
git commit -m "feat: follow-up routes — regenerate, edit, mark as sent"
```

---

## Task 9: Landing Page with Chatbot

**Files:**
- Create: `public/index.html`

- [ ] **Step 1: Create `public/index.html`**

Build a light, clean landing page. The chatbot is an inline panel on the right side of the page on desktop, full-screen on mobile. Key requirements:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>John's AI Services — Let's Talk</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen font-sans">

  <!-- Header -->
  <header class="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
    <span class="font-bold text-gray-900 text-lg">John · AI Services</span>
    <span class="text-sm text-gray-400">Privacy-first · No data leaks</span>
  </header>

  <!-- Main: two-column on desktop, stacked on mobile -->
  <main class="max-w-6xl mx-auto px-4 py-12 flex flex-col lg:flex-row gap-12 items-start">

    <!-- Left: pitch -->
    <section class="flex-1">
      <h1 class="text-4xl font-bold text-gray-900 leading-tight mb-4">
        AI systems that work.<br/>Data that stays yours.
      </h1>
      <p class="text-gray-500 text-lg mb-6">
        I build custom AI chatbots, lead capture systems, and automation tools for businesses that take their data seriously.
      </p>
      <ul class="space-y-2 text-gray-600">
        <li>✦ AI chatbots & lead capture systems</li>
        <li>✦ Modern websites & landing pages — delivered in 1 day</li>
        <li>✦ Real Estate Administration Handbook</li>
        <li>✦ No Zapier. No CRMs. Your data stays private.</li>
      </ul>
    </section>

    <!-- Right: chatbot panel -->
    <section class="w-full lg:w-96 bg-white rounded-2xl shadow-md border border-gray-100 flex flex-col overflow-hidden" style="height:520px">
      <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div class="w-2 h-2 rounded-full bg-green-400"></div>
        <span class="font-semibold text-gray-800 text-sm">Chat with me</span>
      </div>

      <!-- Messages -->
      <div id="messages" class="flex-1 overflow-y-auto px-4 py-4 space-y-3"></div>

      <!-- Capture form (hidden until captureReady) -->
      <div id="capture-form" class="hidden px-4 py-3 border-t border-gray-100 bg-gray-50">
        <p class="text-sm text-gray-500 mb-2">To continue, drop your details below:</p>
        <input id="capture-name" type="text" placeholder="Your name" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <input id="capture-email" type="email" placeholder="Your email" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <button onclick="submitCapture()" class="w-full bg-indigo-600 text-white text-sm rounded-lg py-2 hover:bg-indigo-700 transition">Send</button>
      </div>

      <!-- Input -->
      <div id="input-area" class="px-4 py-3 border-t border-gray-100 flex gap-2">
        <input id="msg-input" type="text" placeholder="Type a message..." class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" onkeydown="if(event.key==='Enter')sendMessage()" />
        <button onclick="sendMessage()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition">→</button>
      </div>
    </section>
  </main>

  <script>
    let sessionId = null;
    let detectedProduct = 'other';

    function addMessage(role, text) {
      const container = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = role === 'user'
        ? 'flex justify-end'
        : 'flex justify-start';
      div.innerHTML = `<div class="max-w-xs px-4 py-2 rounded-2xl text-sm ${role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}">${text}</div>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function addLoader() {
      const container = document.getElementById('messages');
      const div = document.createElement('div');
      div.id = 'loader';
      div.className = 'flex justify-start';
      div.innerHTML = `<div class="bg-gray-100 text-gray-400 px-4 py-2 rounded-2xl text-sm rounded-bl-sm">...</div>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function removeLoader() {
      const loader = document.getElementById('loader');
      if (loader) loader.remove();
    }

    async function sendMessage() {
      const input = document.getElementById('msg-input');
      const message = input.value.trim();
      if (!message) return;
      input.value = '';
      addMessage('user', message);
      addLoader();

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message })
      });
      const data = await res.json();
      removeLoader();
      sessionId = data.sessionId;
      if (data.product) detectedProduct = data.product;
      addMessage('assistant', data.reply);

      if (data.captureReady) {
        document.getElementById('input-area').classList.add('hidden');
        document.getElementById('capture-form').classList.remove('hidden');
      }
    }

    async function submitCapture() {
      const name = document.getElementById('capture-name').value.trim();
      const email = document.getElementById('capture-email').value.trim();
      if (!name || !email) return alert('Please fill in both fields.');

      document.getElementById('capture-form').innerHTML = '<p class="text-sm text-gray-400 text-center py-2">Processing...</p>';

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, name, email, product: detectedProduct })
      });

      document.getElementById('capture-form').innerHTML = '<p class="text-sm text-indigo-600 text-center py-2 font-medium">Thanks! I\'ll be in touch soon.</p>';
    }

    // Kick off conversation on load
    window.onload = () => sendMessage.toString() && fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: null, message: 'Hello' })
    }).then(r => r.json()).then(data => {
      sessionId = data.sessionId;
      addMessage('assistant', data.reply);
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Test manually in browser**

```bash
npm run dev
```
Open http://localhost:3000 — verify chatbot loads, messages send, and AI replies appear.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: landing page with embedded AI chatbot"
```

---

## Task 10: Floating Widget

**Files:**
- Create: `public/widget.html`

- [ ] **Step 1: Create `public/widget.html`**

A standalone demo page showing the chatbot as a floating bubble in the bottom-right corner. Uses the same `/api/chat` endpoint. Structure: blank demo page background + floating button that toggles the chat panel. Reuse the same chat logic from `index.html` but rendered as an overlay widget.

The widget should:
- Start collapsed (show a purple chat bubble button, bottom-right)
- Expand to a 360×480px floating chat panel on click
- Be fully functional (same API, same session logic)
- Include a note at top: "This widget can be embedded on any website"

- [ ] **Step 2: Test manually**

Open http://localhost:3000/widget.html — verify widget opens/closes and chat works.

- [ ] **Step 3: Commit**

```bash
git add public/widget.html
git commit -m "feat: standalone floating widget demo page"
```

---

## Task 11: Admin Dashboard PWA

**Files:**
- Create: `public/admin/index.html`
- Create: `public/admin/manifest.json`
- Create: `public/sw.js`

- [ ] **Step 1: Create `public/admin/manifest.json`**

```json
{
  "name": "Lead Admin",
  "short_name": "Leads",
  "description": "John's lead management dashboard",
  "start_url": "/admin/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#6366f1",
  "icons": [
    {
      "src": "https://placehold.co/192x192/6366f1/white?text=L",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "https://placehold.co/512x512/6366f1/white?text=L",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Create `public/sw.js`**

```js
const CACHE = 'lead-admin-v1';
const SHELL = ['/admin/', '/admin/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('fetch', e => {
  // Only cache shell — let API calls through
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

- [ ] **Step 3: Create `public/admin/index.html`**

Build the admin PWA. Light & Clean theme (white bg, indigo accents, Tailwind CDN). Light sidebar nav with sections: Overview, Leads, Follow-ups, Export.

Key behaviours:
- On load, fetch `/api/stats` and `/api/leads` using `ADMIN_TOKEN` stored in `localStorage` (prompt user on first visit if not set)
- Overview tab: 4 stat cards + bar chart (use plain CSS bars, no chart library needed)
- Leads tab: searchable table with score badge (🔥/🌡️/❄️), status dropdown, click row to see full conversation + AI summary
- Follow-ups tab: list leads with pending follow-ups, editable textarea, "Mark Sent" button
- Export tab: single "Download CSV" button that calls `GET /api/export`
- Register service worker for PWA installability

- [ ] **Step 4: Test manually**

```bash
npm run dev
```
Open http://localhost:3000/admin/ — enter ADMIN_TOKEN, verify stats load, leads appear, follow-up editing works.

Test PWA install prompt in Chrome: DevTools → Application → Manifest → check all fields valid.

- [ ] **Step 5: Commit**

```bash
git add public/admin/index.html public/admin/manifest.json public/sw.js
git commit -m "feat: admin PWA dashboard with overview, leads, follow-ups, and export"
```

---

## Task 12: GitHub Repository Setup

**Files:**
- Update: `HANDOVER.md`

- [ ] **Step 1: Create GitHub repo**

Go to github.com → New repository → name: `lead-capture-chatbot` → Private → no README (we have one).

- [ ] **Step 2: Push to GitHub**

```bash
git remote add origin https://github.com/YOUR_USERNAME/lead-capture-chatbot.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Update `HANDOVER.md` with GitHub URL**

Edit `HANDOVER.md` to add the repo URL and mark all completed tasks.

- [ ] **Step 4: Commit and push**

```bash
git add HANDOVER.md
git commit -m "docs: update handover with GitHub repo URL"
git push
```

---

## Task 13: Render Deployment

- [ ] **Step 1: Create Turso database**

```bash
# Install Turso CLI (if not installed)
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create lead-capture-chatbot
turso db show lead-capture-chatbot   # note the URL
turso db tokens create lead-capture-chatbot  # note the token
```

- [ ] **Step 2: Deploy to Render**

1. Go to render.com → New → Web Service
2. Connect GitHub repo `lead-capture-chatbot`
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all environment variables from `.env.example` with real values

- [ ] **Step 3: Verify live deployment**

Open the Render URL → confirm landing page loads, chatbot responds, and admin dashboard is accessible.

- [ ] **Step 4: Final `HANDOVER.md` update**

Update HANDOVER.md with:
- Live URL on Render
- All tasks marked complete
- Current status: Production

```bash
git add HANDOVER.md
git commit -m "docs: final handover update with live deployment URL"
git push
```

---

## Task 14: Run Full Test Suite

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: All test suites PASS with no failures.

- [ ] **Step 2: Manual smoke test on live URL**

- [ ] Chat works end-to-end (greeting → discovery → capture → thank you)
- [ ] Lead appears in admin dashboard
- [ ] Follow-up message generated
- [ ] Stats chart updates
- [ ] CSV export downloads correctly
- [ ] PWA install prompt appears in Chrome
