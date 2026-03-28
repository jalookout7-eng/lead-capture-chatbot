# Handover — 3D Visual Pro Lead Capture & Chatbot System

## What This Is
3D Visual Pro's production lead capture and management system. Visitors to the landing page chat with an AI assistant that discovers their business needs through one-question-at-a-time conversation, captures their details (name, email, mobile with country code), qualifies them via AI (hot/warm/cold scoring), and generates personalised follow-up messages. The team manages leads via a PWA admin dashboard.

This is NOT a demo or portfolio piece — it is 3D Visual Pro's actual lead management tool, deployed and live.

## Business Context

**Company:** 3D Visual Pro (3D VP) — originally a 3D virtual tours business operating in Indonesia, now expanding its service offering into AI automation, modern website development, digital marketing, and business consultancy.

**Team (all based in Dubai):**
- Farhan Rais Satria — Digital Marketing & Business Strategy
- Wassim Reghis — AI Agents & Marketing Automation
- John Alexander — CRM Systems & Client Operations

**Services offered:**
1. AI chatbots & automation systems (lead capture, qualification, follow-up)
2. Modern websites & landing pages (fast build, conversion-focused)
3. Paid digital advertising (Meta, Google, LinkedIn — fully managed)
4. CRM management & setup (with weekly Friday reports)
5. Business consultancy (audit-first approach, strategy backed by implementation)
6. 3D virtual tours (original core offering, still active)

**Target audience:** Global businesses — not limited to Indonesian property developers (the WordPress landing page at 3dvisualpro.com targets that niche, but this system targets all prospects).

**Pricing model:** Project setup fee + monthly retainer for ongoing management.

**Guarantee:** 80% refund on the setup fee if quality service is not delivered. The remaining 20% covers infrastructure costs (AI subscriptions, hosting, etc.). This guarantee applies to the setup fee only, not the monthly retainer.

**Privacy-first principle:** No third-party CRMs (no Zapier, no HubSpot, no Notion). All lead data stays in Turso (hosted SQLite) under the team's direct control. This is a core business requirement, not a technical preference.

---

## Architecture & Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Server | Node.js + Express | Single server serves API + static files |
| Database | Turso (hosted SQLite) | `@libsql/client`, privacy-aligned, hosted |
| AI | Groq + Llama 3.1 8B Instant | Free tier, ~0.5s responses, swappable via `AI_PROVIDER` env var |
| Frontend | HTML + Tailwind CSS (CDN) | No build step, no framework, static files |
| Auth | Bearer token | `crypto.timingSafeEqual`, fail-closed when `ADMIN_TOKEN` unset |
| Hosting | Render (web service) | Always-on, no dependency on team's PCs |
| Source | GitHub (private repo) | Team accesses from multiple PCs and agents |

**AI provider abstraction:** `src/services/ai.js` exposes `ai.complete(messages) => Promise<string>`. Swap provider by changing `AI_PROVIDER` env var. Currently only Groq adapter implemented, but the interface supports any provider.

---

## v1 — What Was Built (COMPLETE)

Built 2026-03-27. All 14 tasks completed. 17 tests passing across 5 test suites.

### Backend (Tasks 1-8)
- **Project scaffold** — Express server, package.json, .env.example, Jest config
- **Database** — Turso client singleton with env var validation, schema with leads + chat_sessions tables, indexes on created_at and lead_id
- **AI service** — Provider abstraction with Groq adapter, singleton client
- **Auth middleware** — Timing-safe bearer token comparison, 503 when ADMIN_TOKEN not configured
- **Chat route** — `POST /api/chat` with session management, system prompt for AI personality, signal stripping (PRODUCT and CAPTURE_READY signals detected server-side and stripped from user-visible reply)
- **Qualifier service** — Single AI call analyzes conversation, returns `{summary, bottlenecks, score, followup}` with validation (score must be hot/warm/cold, required fields checked)
- **Leads routes** — Full CRUD: POST capture+qualify, GET list/stats/export/single, PATCH status. Route order ensures `/stats` and `/export` registered before `/:id` to prevent Express param collision. CSV export with RFC 4180 double-quote escaping.
- **Follow-up routes** — POST regenerate (re-runs qualifier), PATCH edit/mark-sent

### Frontend (Tasks 9-11)
- **Landing page** (`public/index.html`) — Two-column layout (pitch left, chatbot right), Tailwind CSS, auto-greeting on load, capture form appears when AI signals CAPTURE_READY, XSS-safe (textContent not innerHTML for user content), error handling on all fetch calls
- **Floating widget** (`public/widget.html`) — Standalone demo page with collapsible chat bubble, same API integration
- **Admin dashboard PWA** (`public/admin/index.html`) — Light theme with indigo accents, 4 tabs (Overview, Leads, Follow-ups, Export), PWA manifest + service worker, token stored in localStorage

### Deployment (Tasks 12-14)
- **GitHub** — Private repo at `github.com/jalookout7-eng/lead-capture-chatbot`
- **Render** — Deployed at `lead-capture-chatbot.onrender.com` with all env vars configured
- **Tests** — 17/17 passing (auth, AI, chat, leads, followup test suites)

### Key Design Decisions Made in v1
- **`crypto.randomUUID()` over `uuid` package** — uuid v11+ is ESM-only, breaks Jest. Built-in Node crypto works.
- **Signal stripping regex** — `CAPTURE_READY` and `PRODUCT:<type>` embedded by AI in replies, stripped server-side before returning to user. Robust regex handles signal at start/middle/end of message.
- **Fail-closed auth** — If ADMIN_TOKEN env var is not set, all admin routes return 503 (not 200).
- **No migration framework** — ALTER TABLE in initDb() is appropriate for current scale.
- **Groq singleton** — Client instantiated once, not per request.

---

## v2 — Planned Improvements (DESIGN APPROVED, PENDING IMPLEMENTATION PLAN)

**Full spec:** `docs/superpowers/specs/2026-03-27-v2-improvements-design.md`

### 1. Landing Page Redesign
Rebrand from "John's AI Services" to **3D Visual Pro**. Full editorial page matching the existing WordPress brand (see `3DVISUALPRO.txt` for reference).

**Structure:** Hero (bold headline, guarantee badge, stats bar) > Problem (4 pain-point cards) > Services (4 service cards) > How It Works (5-step process) > Why Choose Us (3 cards including refund guarantee) > Team (3 members with photos) > Final CTA (dark section).

**Floating chatbot widget** replaces the inline chatbot panel. Pings/pulses on load to draw attention. The landing page has NO form card — the chatbot is the sole capture mechanism.

**Brand:** `.dvp` CSS namespace, Montserrat headings, Plus Jakarta Sans body, `#007bff` blue primary, `#1a1a2e` dark navy, `#00c853` green success.

**Embeddability:** Self-contained HTML/CSS with configurable `API_BASE` variable. Can later be dropped into 3dvisualpro.com WordPress site via Elementor HTML widget. CORS configuration will be needed at that point (out of scope for now).

### 2. Chatbot AI Rewrite
**Problems with v1 chatbot:**
- Asked multiple questions in a single message (especially toward end of discovery)
- Sounded too salesy — pitched 3D Visual Pro's value during discovery instead of listening
- Triggered CAPTURE_READY while questions were still pending, closing the chat input before the visitor could answer
- Identified itself as "John" instead of the team

**v2 fixes — new system prompt enforces:**
- Identity: "3D Visual Pro assistant", speaks as "we"/"our team"
- One question per message, always
- 2-3 sentences max per response (token efficiency)
- Consultative tone: curious and helpful, never pitching or selling
- Never asks about budget or timeline
- 4 discovery paths: AI Automation, Modern Websites, Digital Marketing, General/Not Sure
- Routing: open-ended first question, AI infers service from response (no menu)
- General path funnels into a specific service path after 1-2 questions
- Minimum 4 exchanges before CAPTURE_READY can fire
- CAPTURE_READY only after discovery is genuinely complete

**Updated product types:** `ai_service`, `website`, `marketing`, `consultancy`, `other` (removes `real_estate`). Legacy `real_estate` values displayed as-is in admin — no data migration.

### 3. Admin Dashboard — Dark + Neon Mission Control
Complete visual overhaul. Dark background (#0a0a1a), cyan-green neon accents (#00ffc8), glowing borders, monospace numbers. No emojis anywhere — colored text labels (HOT, WARM, COLD) instead.

**Same 4 tabs:** Overview (fix stats bug), Leads (add notes field + phone display), Follow-ups, Export (add phone + notes to CSV).

**New features:**
- Notes textarea in lead detail view — editable, auto-saves on blur
- Phone number displayed in leads table and detail view
- Stats bug fix: Overview cards and chart not rendering data for existing leads

### 4. Database & API Updates
**New columns:** `phone TEXT` (optional, free-text with country code) and `notes TEXT` on leads table. Added via ALTER TABLE in initDb().

**New endpoint:** `PATCH /api/leads/:id/notes` — saves admin notes, returns `{ success: true }`.

**Updated endpoints:** POST /api/leads accepts `phone`, GET endpoints return `phone` and `notes`, CSV export includes both new columns.

### 5. Capture Form Update
Add mobile number field with country code to the chatbot capture form (alongside existing name and email fields). Phone is optional — no server-side format validation.

---

## Known Issues / Bugs
- **Overview stats bug:** Stat cards show placeholder dashes and bar chart is empty even when leads exist in the database. Leads appear correctly in the Leads tab. Likely cause: leadsByDay array from GET /api/stats may be empty, or renderChart()/loadStats() has a display issue.

---

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `src/server.js` | Express entry point, registers all routes, calls initDb() |
| `src/db/client.js` | Turso singleton with env var validation |
| `src/db/schema.sql` | Reference schema (leads + chat_sessions tables) |
| `src/services/ai.js` | AI provider abstraction (swap via AI_PROVIDER env var) |
| `src/services/qualifier.js` | AI lead scoring — single call returns summary, bottlenecks, score, followup |
| `src/middleware/auth.js` | Bearer token auth with timing-safe comparison |
| `src/routes/chat.js` | POST /api/chat — session management, AI replies, signal stripping |
| `src/routes/leads.js` | Full leads CRUD + stats + CSV export |
| `src/routes/followup.js` | Follow-up regenerate + edit/mark-sent |

### Frontend
| File | Purpose |
|------|---------|
| `public/index.html` | Landing page with chatbot (v1 — will be rewritten in v2) |
| `public/widget.html` | Floating widget demo (will be updated in v2) |
| `public/admin/index.html` | Admin PWA dashboard (will be rewritten in v2) |
| `public/admin/manifest.json` | PWA manifest |
| `public/sw.js` | Service worker for offline caching |

### Documentation
| File | Purpose |
|------|---------|
| `HANDOVER.md` | This file — project progress reference |
| `3DVISUALPRO.txt` | Existing WordPress landing page HTML (brand reference for colors, fonts, structure, team photos) |
| `docs/superpowers/specs/2026-03-27-lead-capture-chatbot-design.md` | v1 design spec |
| `docs/superpowers/specs/2026-03-27-v2-improvements-design.md` | v2 improvements design spec |
| `docs/superpowers/plans/2026-03-27-lead-capture-chatbot.md` | v1 implementation plan (14 tasks) |
| `.env.example` | Environment variable template |

### Tests
| File | Covers |
|------|--------|
| `tests/auth.test.js` | Auth middleware (missing token, wrong token, valid token, unset ADMIN_TOKEN) |
| `tests/ai.test.js` | AI service (unknown provider, Groq adapter) |
| `tests/chat.test.js` | Chat route (session creation, AI replies, signal stripping) |
| `tests/leads.test.js` | Leads routes (capture, list, stats, export, status update) |
| `tests/followup.test.js` | Follow-up routes (auth, regenerate, edit/mark-sent) |

---

## Live URLs
- **Landing page:** https://lead-capture-chatbot.onrender.com
- **Admin dashboard:** https://lead-capture-chatbot.onrender.com/admin/
- **Widget demo:** https://lead-capture-chatbot.onrender.com/widget.html
- **GitHub:** https://github.com/jalookout7-eng/lead-capture-chatbot

## Environment Variables
See `.env.example`. All must be set on Render:
- `AI_PROVIDER` — `groq`
- `AI_MODEL` — `llama-3.1-8b-instant`
- `AI_API_KEY` — Groq API key
- `TURSO_URL` — Turso database URL
- `TURSO_TOKEN` — Turso auth token
- `ADMIN_TOKEN` — password for admin dashboard access
- `PORT` — `3000`

## Running Locally
1. Copy `.env.example` to `.env` and fill in values
2. `npm install`
3. `npm run dev`
4. Open http://localhost:3000

## Running Tests
`npm test` — expects 17 tests passing across 5 suites.

---

## Next Steps
1. **Create v2 implementation plan** — invoke writing-plans skill to break the v2 spec into ordered tasks
2. **Execute v2 tasks** — subagent-driven development, same approach as v1
3. **Push to GitHub + redeploy on Render** — after all v2 tasks complete
4. **Smoke test live deployment** — verify chatbot behavior, admin dashboard, and capture flow end-to-end
