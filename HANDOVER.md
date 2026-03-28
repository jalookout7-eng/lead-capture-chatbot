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

## v2 — 3D Visual Pro Rebrand (COMPLETE)

Built 2026-03-28. All 11 tasks completed. 23 tests passing across 5 test suites. 8 commits.

**Full spec:** `docs/superpowers/specs/2026-03-27-v2-improvements-design.md`
**Implementation plan:** `docs/superpowers/plans/2026-03-28-v2-improvements.md`

### 1. Landing Page Redesign
Full editorial marketing page for **3D Visual Pro** with 7 sections: Hero (headline, stats bar, guarantee badge, dual CTAs) > Problem (4-card grid) > Services (4 service cards) > How It Works (5-step process table/cards) > Why Choose Us (3 cards) > Team (3 members with WordPress photos) > Final CTA (dark section).

**Floating chatbot widget** replaces the inline chatbot panel. Pulse animation on load. The chatbot is the sole capture mechanism — no form cards on page.

**Brand:** `.dvp-` CSS namespace, Montserrat headings, Plus Jakarta Sans body, `#007bff` blue primary, `#1a1a2e` dark navy, `#00c853` green success.

**Embeddability:** Self-contained HTML/CSS with configurable `API_BASE` variable via `window.DVP_CHAT_CONFIG.apiBase`. Can be embedded on 3dvisualpro.com via Elementor HTML widget (CORS config needed at that point — out of scope for now).

### 2. Chatbot AI Rewrite
New system prompt enforces:
- Identity: "3D Visual Pro assistant", speaks as "we"/"our team"
- One question per message, always
- 2-3 sentences max per response
- Consultative tone: curious and helpful, never pitching or selling
- Never asks about budget or timeline
- 4 discovery paths: AI Automation, Modern Websites, Digital Marketing, General/Not Sure
- Routing through natural conversation (no menu)
- Minimum 4 exchanges before CAPTURE_READY can fire

**Product types:** `ai_service`, `website`, `marketing`, `consultancy`, `other` (removed `real_estate`). Legacy values displayed as-is in admin.

### 3. Admin Dashboard — Dark + Neon Mission Control
Complete visual overhaul. Dark background (#0a0a1a), cyan-green neon accents (#00ffc8), glowing borders, monospace numbers. Colored text labels (HOT, WARM, COLD) — no emojis.

**4 tabs:** Overview (stats bug fixed), Leads (notes field + phone display), Follow-ups, Export (phone + notes in CSV).

**New features:**
- Login overlay (replaces prompt())
- Notes textarea in lead detail — auto-saves on blur via PATCH /api/leads/:id/notes
- Phone number displayed in detail view
- Stats bug fixed: stat cards and chart now render actual data
- 401 handling: clears token and shows login overlay

### 4. Database & API Updates
**New columns:** `phone TEXT` and `notes TEXT` on leads table. Added via ALTER TABLE in initDb() with try/catch for idempotency.

**New endpoint:** `PATCH /api/leads/:id/notes` — saves admin notes, returns `{ success: true }`.

**Updated endpoints:** POST /api/leads accepts `phone`, GET endpoints return `phone` and `notes`, CSV export includes both new columns.

### 5. Capture Form Update
Phone field added to chatbot capture form (landing page and widget). Optional, free-text with country code, no server-side format validation.

---

## v2.1 — Revisions & Mission Control Feed (COMPLETE)

Built 2026-03-28 (same day as v2). Addresses user feedback from live testing.

### Landing Page Revisions
- **Hero two-column layout** — added a business/AI image on the right side to fill the empty space (hides on mobile)
- **Warm chat greeting** — replaced cold AI-generated greeting with static welcome: "Hey there! Welcome to 3D Visual Pro. Let's chat about what brought you here." First API call now happens on the user's first message.
- **Mobile chatbot full-screen** — on mobile (<700px), the chat widget goes full-screen (position fixed, inset 0) to avoid keyboard overlap
- **Guarantee wording** — clarified that the 80% refund is the team's full margin and incentives; the 20% covers third-party infrastructure costs (AI, database, hosting)
- **Auto-open widget** — chatbot opens automatically after 5 seconds on page or when user scrolls past 30% (whichever comes first, triggers once)

### Admin Dashboard Fixes
- **Stats bug fix (root cause)** — dashboard was fetching `/api/stats` and `/api/export` but the correct URLs are `/api/leads/stats` and `/api/leads/export` (routes are mounted under `/api/leads` in Express). Fixed both URLs.
- **Mission Control Feed** — new always-visible section at the bottom of the dashboard with three cards:
  - **Daily Fuel** — rotating motivational quote (30 quotes, changes daily) covering discipline, business, tech, and execution
  - **Market Pulse** — live BTC, ETH prices (CoinGecko API) and NVIDIA stock (Yahoo Finance) with 24hr % change, green/red coloring
  - **AI Intel** — latest AI headlines from TechCrunch AI category (covers OpenAI, Anthropic, DeepSeek, etc.), links open in new tabs

---

## Privacy Architecture

**Core principle:** No third-party CRMs. All lead data stays under the team's direct control.

**Data flow:**
- **Chat messages** (anonymous conversation text) — sent to Groq's API for AI response generation. Groq processes transiently, does not train on API data, does not store long-term. No personal details are included in these calls.
- **Personal details** (name, email, phone) — captured via the form AFTER chat, sent directly to Turso database. Groq never sees these.
- **Lead data** (scores, summaries, notes, follow-ups) — stored in Turso, accessed only via the team's auth tokens.

| Data | Who sees it |
|------|------------|
| Chat conversation text | Groq (transiently, for AI replies) + Turso (stored) |
| Name, email, phone | Turso only |
| Lead scores, notes, follow-ups | Turso only |
| Admin dashboard | Anyone with the ADMIN_TOKEN |

**Future option:** Self-host an open-source LLM (e.g., Llama running locally) to eliminate even the transient Groq dependency. The `AI_PROVIDER` abstraction in `src/services/ai.js` was designed for this swap.

---

## WordPress Embedding Plan

The chatbot widget is built ready for embedding on 3dvisualpro.com:

1. Copy the floating widget HTML/CSS/JS from `public/index.html`
2. Paste into an Elementor HTML widget on the WordPress site
3. Set config: `window.DVP_CHAT_CONFIG = { apiBase: 'https://lead-capture-chatbot.onrender.com' }`
4. Add CORS to Express server to allow requests from the WordPress domain

**Speed note:** Render starter tier has cold starts (30-50s after inactivity). Options: upgrade to Render paid plan (always-on), migrate to Railway/Fly.io, or self-host on a VPS.

---

## 80% Money-Back Guarantee — Explained

The guarantee applies to the project setup fee only (not the monthly retainer):
- **80% refunded** = the team's complete margin and incentives. This is everything the team would have earned for their work.
- **20% retained** (or less) = covers third-party infrastructure costs already paid on the client's behalf: AI model subscriptions (Groq/etc.), database hosting (Turso), server hosting (Render), and other tools.
- The client does not pay for work that doesn't deliver.

---

## Known Issues / Bugs
- None currently tracked.

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
| `public/index.html` | 3D Visual Pro editorial landing page with floating chatbot widget |
| `public/widget.html` | Standalone floating widget demo with API_BASE config |
| `public/admin/index.html` | Dark neon mission control admin dashboard |
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
| `docs/superpowers/plans/2026-03-28-v2-improvements.md` | v2 implementation plan (11 tasks) |
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
`npm test` — expects 23 tests passing across 5 suites.

---

## Next Steps
1. **Smoke test live deployment** — verify chatbot, admin dashboard, and capture flow at https://lead-capture-chatbot.onrender.com
2. **Add privacy/trust section to landing page** — explain the privacy-first approach as a selling point for prospects
3. **Embed chatbot on WordPress** — drop widget into Elementor HTML widget on 3dvisualpro.com, set API_BASE, configure CORS
4. **Visitor analytics** — add page view tracking
5. **Automated follow-ups** — AI-powered email/WhatsApp follow-up agent
6. **Upgrade AI provider** — swap from Groq/Llama to Claude or GPT-4 for better conversation quality
