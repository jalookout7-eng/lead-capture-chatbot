# AI-Powered Secure Lead Capture & Chatbot System — Design Spec

**Date:** 2026-03-27
**Owner:** John
**Status:** Approved

---

## 1. Overview

A privacy-first, production-grade lead capture and management system for John's multi-product business. Visitors to John's landing page are engaged by an AI chatbot that discovers their needs through business-focused conversation, captures their details, qualifies them, and generates a personalised follow-up message. John manages all leads through a PWA admin dashboard — no third-party CRM, no data leaks.

This system serves a dual purpose:
1. **John's live lead management tool** for his own Fiverr/services business
2. **A Fiverr portfolio showcase** demonstrating what he builds for clients

---

## 2. Business Context

John's current product/service offerings:
- **AI Systems & Automation** — AI chatbots, lead capture systems, automation for businesses
- **Modern Websites & Landing Pages** — fast, professional sites built in 1 day after needs audit
- **Real Estate Administration Handbook** — resource for individuals entering real estate
- **AI-related products and services** — growing catalogue

Leads arrive via his online presence and are routed to the appropriate conversation path based on interest.

---

## 3. Architecture

### Approach: Full-Stack Express (Single Server)
One Node.js + Express server handles everything — API routes, static file serving, and the admin dashboard. Simple to deploy, one port, one process.

### Stack
| Layer | Technology | Reason |
|---|---|---|
| Backend | Node.js + Express | Familiar, fast to build, easy to deploy |
| Frontend | HTML + Tailwind CSS | Lightweight, no build step for static pages |
| Database | Turso (hosted SQLite) | Privacy-aligned, persistent, free tier, SQLite-compatible |
| AI | Groq + Llama 3.1 8B Instant | Free tier, ~0.5s response time, swappable via config |
| Deployment | Render (free tier) | Always-on public URL, auto-deploys from GitHub |
| Source control | GitHub | Cross-device access, agent handover, CI/CD |

### AI Provider Abstraction
The AI provider is fully swappable via environment variables — no code changes needed:
```
AI_PROVIDER=groq          # groq | openai | anthropic | ollama
AI_MODEL=llama-3.1-8b-instant
AI_API_KEY=your_key_here
```

**`src/services/ai.js` interface contract:**
```js
// Single exported function — all providers normalise to this shape
ai.complete(messages: Array<{ role: 'system'|'user'|'assistant', content: string }>)
  => Promise<string>   // returns the assistant reply text only
```
Internally, `ai.js` switches on `AI_PROVIDER` env var and maps each provider's SDK to this contract. Groq, OpenAI, and Anthropic all accept the same messages array format. Ollama uses a local HTTP call to the same shape. Adding a new provider = adding one adapter block.

---

## 4. Project Structure

```
lead-capture-chatbot/
├── public/
│   ├── index.html           # Landing page with embedded chatbot
│   ├── widget.html          # Standalone floating widget demo
│   ├── admin/
│   │   ├── index.html       # Admin dashboard (PWA)
│   │   └── manifest.json    # PWA manifest
│   └── sw.js                # Service worker (offline + installable)
├── src/
│   ├── server.js            # Express entry point
│   ├── routes/
│   │   ├── chat.js          # POST /api/chat
│   │   ├── leads.js         # GET/POST/PATCH /api/leads + GET /api/stats + GET /api/export
│   │   └── followup.js      # POST /api/followup/:id, PATCH /api/followup/:id
│   ├── db/
│   │   ├── client.js        # Turso client setup
│   │   └── schema.sql       # Database schema
│   └── services/
│       ├── ai.js            # AI provider abstraction layer (see Section 3)
│       └── qualifier.js     # Hot/Warm/Cold scoring logic (see Section 6)
├── .env.example
├── HANDOVER.md
└── package.json
```

---

## 5. Data Model

```sql
-- All captured leads
CREATE TABLE leads (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  product         TEXT NOT NULL,          -- 'ai_service' | 'real_estate' | 'other'
  summary         TEXT,                   -- AI-generated business/situation summary
  bottlenecks     TEXT,                   -- JSON array of strings: AI-identified bottlenecks
  score           TEXT DEFAULT 'cold',    -- 'hot' | 'warm' | 'cold'
  followup        TEXT,                   -- AI-drafted personalised follow-up message
  followup_sent   INTEGER DEFAULT 0,      -- 0 = not sent, 1 = sent
  status          TEXT DEFAULT 'new',     -- 'new' | 'contacted' | 'converted' | 'closed'
  created_at      TEXT NOT NULL
);

-- Full conversation history per session
CREATE TABLE chat_sessions (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT REFERENCES leads(id),  -- NULL until lead is captured
  messages    TEXT NOT NULL,              -- JSON array: [{role, content}]
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL               -- updated on every message append
);
```

**Message append strategy:** On each chat turn, the server loads the existing `messages` JSON array from `chat_sessions`, appends the new `{role:'user', content}` and `{role:'assistant', content}` entries, then writes the full array back via UPDATE. This is appropriate at this scale and keeps the schema simple.

---

## 6. Lead Scoring (qualifier.js)

Scoring is AI-delegated: after lead capture, a single structured AI call analyses the full conversation and returns all four outputs together as JSON:

```json
{
  "summary": "Sarah runs a 3-person real estate agency...",
  "bottlenecks": ["Manual lead tracking in spreadsheets", "No follow-up system"],
  "score": "hot",
  "followup": "Hi Sarah, loved learning about your agency..."
}
```

**Scoring rubric passed to AI in system prompt:**
- **Hot** — clear business need identified, specific use case discussed, decision-maker signals present
- **Warm** — engaged and interested but requirements are vague or exploratory
- **Cold** — information gathering only, no clear need, or disengaged

This single combined call keeps Stage 4 processing synchronous and fast (one Groq call ≈ 1–2s).

---

## 7. API Routes

### Chat
| Method | Route | Auth | Request Body | Response |
|---|---|---|---|---|
| `POST` | `/api/chat` | None | `{ sessionId: string\|null, message: string }` | `{ sessionId: string, reply: string, stage: 'discovery'\|'capture'\|'done', captureReady: boolean }` |

- `sessionId` is `null` on the first message; server creates a new `chat_sessions` row and returns the new ID
- `stage` reflects the current conversation stage so the frontend can update UI accordingly
- `captureReady: true` signals the frontend to render the name/email capture form inline

### Leads
| Method | Route | Auth | Request Body | Response |
|---|---|---|---|---|
| `POST` | `/api/leads` | None | `{ sessionId: string, name: string, email: string, product: string }` | `{ id: string, score: string, followup: string }` |
| `GET` | `/api/leads` | Token | — | Array of all lead records |
| `GET` | `/api/leads/:id` | Token | — | Single lead + linked chat session messages |
| `PATCH` | `/api/leads/:id/status` | Token | `{ status: string }` | Updated lead record |

- `POST /api/leads` links the session to the new lead, then makes one AI call to generate `summary`, `bottlenecks`, `score`, and `followup` synchronously before responding
- Response is returned only after AI processing completes (typically 1–3s); frontend shows a loading state

### Follow-ups
| Method | Route | Auth | Request Body | Response |
|---|---|---|---|---|
| `POST` | `/api/followup/:id` | Token | — | `{ followup: string }` — regenerated message |
| `PATCH` | `/api/followup/:id` | Token | `{ followup: string, sent: boolean }` | Updated lead record |

### Stats & Export
| Method | Route | Auth | Response |
|---|---|---|---|
| `GET` | `/api/stats` | Token | `{ total, hot, warm, cold, leadsByDay: [{date, count}] }` |
| `GET` | `/api/export` | Token | CSV file download of all leads |

All admin routes protected by `Authorization: Bearer <ADMIN_TOKEN>` header check.

---

## 8. Chatbot Conversation Flow

### Stage 1 — Route the lead
The chatbot greets the visitor and identifies which product/service they are interested in:
- AI systems / automation for their business
- Modern website or landing page (fast build, 1-day delivery after needs audit)
- Real Estate Handbook
- Something else

### Stage 2A — Business Discovery (AI/Automation leads)
Goal: understand the business fully to identify bottlenecks internally. The chatbot asks open, conversational questions across these areas:
- What does the business do and who do they serve?
- How is the team structured?
- How do they currently handle customer interactions and operations?
- What tools and systems do they use day-to-day?
- Where do things slow down or fall through the cracks?

The AI does **not** ask about budget, timeline, or explicitly "what's your problem." It builds a full picture and surfaces insights itself.

### Stage 2B — Individual / Product path (Real Estate, etc.)
Shorter discovery: understand the visitor's current situation, goals, and where they are in their journey.

### Stage 3 — Lead Capture trigger
When the AI determines it has gathered enough context (typically after 4–6 exchanges), it sets `captureReady: true` in the API response. The frontend renders an inline name/email form within the chat window. The visitor submits the form, triggering `POST /api/leads`.

### Stage 4 — AI Processing (synchronous, server-side)
On `POST /api/leads`, the server:
1. Links the `chat_sessions` row to the new lead
2. Makes a single structured AI call with the full conversation history
3. Receives and stores `summary`, `bottlenecks`, `score`, and `followup` atomically
4. Returns the result to the frontend (~1–3s total)

Frontend shows a brief loading state ("Analysing your information...") during this step.

*Note: Detailed chatbot system prompt, tone guidelines, and exact wording to be defined during implementation.*

---

## 9. Admin Dashboard (PWA)

**Theme:** Light & Clean — white background, subtle shadows, indigo accents, Tailwind CSS.

**Layout:** Light-themed sidebar navigation with sections:
- **Overview** — stat cards (total, hot, warm, cold) + bar chart (leads per day, data from `GET /api/stats`)
- **Leads** — full table with filters (status, product, score), search, and per-lead detail view
- **Follow-ups** — review and edit AI-drafted messages (`PATCH /api/followup/:id`), mark as sent (sets `followup_sent = 1`)
- **Export** — download CSV via `GET /api/export`

**PWA features:**
- `manifest.json` — installable on iOS, Android, and desktop from browser
- `sw.js` service worker — caches dashboard shell for offline access
- Designed mobile-first so John can manage leads from his phone

---

## 10. Security

- No third-party CRM or automation platforms
- No unnecessary external data transfers
- All lead data stored in Turso (John-controlled)
- Admin dashboard protected by bearer token
- API keys and secrets stored as Render environment variables only — never in code
- `.env.example` committed, `.env` gitignored

---

## 11. Deployment

```
GitHub repo (source of truth)
  └── HANDOVER.md (always up to date)
  └── Auto-deploy to Render on push to main
        └── Live at: yourapp.onrender.com
              └── Admin PWA installable on phone/desktop
```

**Environment variables (set on Render, never in repo):**
```
AI_PROVIDER=groq
AI_MODEL=llama-3.1-8b-instant
AI_API_KEY=
TURSO_URL=
TURSO_TOKEN=
ADMIN_TOKEN=
PORT=3000
```

**Free tier note:** Render's free tier sleeps after 15 minutes of inactivity (~30s cold start on first load). Acceptable for current stage. Can upgrade to paid tier or add a keep-alive ping when needed.

---

## 12. Future Considerations (Out of Scope Now)

- Automated email/call follow-up via AI agent
- Multi-user admin access with roles
- Notion sync (one-way push) for secondary viewing
- Upgrade AI provider to Claude/GPT-4 via env var swap
- Additional product paths as John's catalogue grows
- Analytics: conversion tracking, lead source attribution
