# Handover — 3D Visual Pro Lead Capture & Chatbot System

> **Status (21 May 2026):** Live on Vercel. Chatbot "Aria" + Mission Control admin. Versions v1 → v2.2 (foundation) and the four-part **Mission Control Expansion** (Sub-projects A, B, C, D) are all shipped and migrated to production. 188 tests passing. Latest UI work: scraper redesign (PR #10), mobile leads fix (PR #9), nav reorder (PR #8). See "Mission Control Expansion" section for the current feature set.

## What This Is
3D Visual Pro's production lead capture and management system. Visitors to the landing page chat with **Aria**, an AI assistant that discovers their business needs through one-question-at-a-time conversation, captures their details (name, email, mobile with country code), qualifies them via AI (hot/warm/cold scoring), and generates personalised follow-up messages. The team manages leads via **Mission Control** — a PWA admin dashboard with pipeline tracking, notes, notifications, a Google Maps lead scraper, and a versioned "intelligence" layer that lets Aria improve from lead outcomes.

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
| Server | Node.js + Express 5 | Single server serves API + static files |
| Database | Turso (hosted SQLite) | `@libsql/client`, privacy-aligned, hosted. URL: `libsql://3d-visual-pro-3dvisualpro.aws-ap-northeast-1.turso.io` |
| AI | Groq + Llama 3.1 8B Instant | Free tier, ~0.5s responses, swappable via `AI_PROVIDER` env var |
| Frontend | Vanilla HTML/CSS/JS | Admin is a single `public/admin/index.html`. Chart.js + SheetJS via CDN. No build step. |
| Email | Resend (`resend` SDK) | Team alert + lead confirmation on capture (Sub-project B) |
| Web Push | `web-push` (VAPID) | PWA push to phones; keys auto-generated on first boot (Sub-project B) |
| Scraper | `@googlemaps/google-maps-services-js` | Google Places Text Search + Place Details (Sub-project C) |
| Auth | Bearer token | `crypto.timingSafeEqual`, fail-closed when `ADMIN_TOKEN` unset |
| Hosting | **Vercel** (auto-deploy on merge to `main`) | Live at `lead-capture-chatbot-beta.vercel.app`. **Render is legacy — ignore `*.onrender.com`.** |
| Source | GitHub (private repo) | `jalookout7-eng/lead-capture-chatbot` |
| Testing | Jest + supertest | `npm test` — 188 passing across 15 suites |

**AI provider abstraction:** `src/services/ai.js` exposes `ai.complete(messages) => Promise<string>`. Swap provider by changing `AI_PROVIDER` env var. Currently only Groq adapter implemented, but the interface supports any provider.

**Migrations:** No framework — each schema change is a standalone idempotent script in `scripts/migrate-vN.js`, run manually against Turso before merging the dependent code (`TURSO_URL=... TURSO_TOKEN=... node scripts/migrate-vN.js`). Applied to production so far: v2, v4, v5, v6, v7. (v1/v3 numbers were skipped/superseded.)

**Deploy flow:** Merge a PR to `main` → Vercel auto-builds and deploys. The service worker (`public/sw.js`) cache key (`lead-admin-vN`) is bumped on every admin-HTML change so clients fetch the new shell instead of a stale cache. Currently at `lead-admin-v9`.

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

## v2.2 — Revisions & Admin Expansion (COMPLETE)

Built 2026-03-29. All 10 tasks completed. 32 tests passing across 5 test suites. 8 commits.

**Full spec:** `docs/superpowers/specs/2026-03-29-v2.2-revisions-design.md`
**Implementation plan:** `docs/superpowers/plans/2026-03-29-v2.2-revisions.md`

### 1. Chatbot System Prompt Rewrite

The chatbot was too verbose — offering suggestions, using filler language, and subtly pitching services. The system prompt was completely rewritten with these rules:

- **Sole purpose:** Collect information about the visitor's business, current structure, and bottlenecks. Never advise, suggest, sell, or pitch.
- **Concise:** 1-2 sentences max per response. Acknowledge briefly ("Got it", "Understood") then ask the next question.
- **Up to 2 questions per message** if naturally related (e.g. "What does your business do and who do you serve?"). Never more than two.
- **Off-topic redirect:** If the visitor asks about 3D Visual Pro's services, pricing, or goes off-topic, acknowledge briefly then redirect: the chatbot's job is to learn about the visitor, not discuss the team's offerings.
- **Minimum 3 exchanges** before CAPTURE_READY (reduced from 4). Prompt-only guard, no server-side enforcement.
- **Target ~5-6 total exchanges.** Discovery paths streamlined to 2 core questions each (business context covered by the opening question).

**Key decision:** The chatbot does NOT give suggestions or recommendations. That's the team's job during the follow-up consultation. The chatbot strictly extracts: what the business does, how it currently operates, and where things break down.

### 2. Manual Lead Entry & Excel Upload

The admin dashboard now supports adding leads from sources outside the chatbot (referrals, events, cold outreach).

**Single lead form:** "Add Lead" button in the Leads tab opens a modal with: name, email, phone, product (dropdown), score (dropdown — admin sets this manually), notes. No AI qualification for manual leads — summary, bottlenecks, and followup fields are empty.

**Excel/CSV bulk upload:** "Upload Excel" button accepts `.xlsx` or `.csv` files. Client-side parsing via SheetJS (CDN). Expected column format: name, email, phone, product, score, notes. Maximum 500 rows per upload. Partial-success model — valid rows are inserted even if others fail. Shows import count and error details.

**New API endpoints:**
- `POST /api/leads/manual` (auth required) — single manual lead entry with validation
- `POST /api/leads/import` (auth required) — bulk import with per-row validation and error reporting

**Key decisions:**
- Basic email validation only (must contain @). No duplicate detection — team may intentionally add the same contact for different products.
- Bulk import is NOT transactional. If row 3 fails, rows 1-2 are already inserted and row 4+ continues. Admin can fix and re-upload failed rows.
- Express JSON body limit increased to 2MB (`express.json({ limit: '2mb' })`) to support large bulk uploads.

### 3. Lead Detail — Explicit Save & Status Dropdown

Previously, notes auto-saved on blur (not obvious). Status had no UI control in the detail view.

**Changes:**
- **Status dropdown** (new / contacted / converted / closed) now visible in lead detail, pre-selected from current value
- **Notes textarea** retained but blur-save removed
- **Explicit Save button** fires both PATCH calls in parallel (`Promise.all`). Shows "Saved" confirmation for 2 seconds, or "Save failed" on error.

### 4. Daily Fuel — 5 Quotes with Fade Animation

Previously showed 1 static quote per day. Now:
- Picks 5 random quotes from the 30-quote pool on each page load
- Each quote fades in (1s), holds (4s), fades out (1s), next quote fades in
- Loops continuously through the 5 quotes (~30 second cycle)
- CSS transitions drive the fade, JS setTimeout chain drives the cycle

### 5. Market Pulse — Expanded Rolling Ticker with Server Proxy

Previously showed only BTC and ETH (NVIDIA was supposed to show but failed silently due to Yahoo Finance CORS blocking browser requests).

**Root cause fix:** All market data now fetched server-side via `GET /api/market` (no auth, public data). No more browser-direct calls to Yahoo Finance.

**New file:** `src/routes/market.js` — server-side proxy with 1-hour in-memory cache.

**Assets tracked (9 total):**
- **Crypto:** BTC, ETH, Solana, XRP (CoinGecko API)
- **Stocks:** NVIDIA, Tesla, S&P 500 (Yahoo Finance chart API)
- **Commodities:** Gold, Oil/WTI Crude (Yahoo Finance chart API)

**Frontend:** Vertical rolling ticker (bottom-to-top CSS animation). Items show symbol, price, 24hr % change (green/red). Pauses on hover. Hourly refresh via `setInterval`. Graceful fallback — individual assets show "N/A" if their API call fails.

**Key decisions:**
- Yahoo Finance API is unofficial with no SLA. Server-side proxy with User-Agent header and in-memory caching mitigates rate limits and CORS issues.
- Cache is in-memory (resets on server restart). Acceptable for current scale.
- CoinGecko free tier rate limits (~10-30 req/min) are fine with 1-hour cache.

---

## v3 — Mission Control Expansion (COMPLETE, shipped May 2026)

Four independent sub-projects, each with its own DB migration, routes, and admin UI surface, so they could ship one at a time. Specs live in the landing-page repo (`3D Visual Pro/docs/superpowers/specs/`), plans in `.../plans/`. All four are merged to `main`, migrated on Turso, and live. The chatbot's system prompt is now sourced from `src/services/aria-core-prompt.md` (the assistant is named **Aria**).

**Migration map:** A → `migrate-v2`, B → `migrate-v4`, polish → `migrate-v5`, C → `migrate-v6`, D → `migrate-v7`.

### Sub-project A — MC Core Enhancements (PR #1)
- **Timestamped notes log** (`lead_notes` table) replaces the single notes field.
- **Configurable pipeline statuses** (`pipeline_status_options` table + `leads.pipeline_status` column) with an enable/disable toggle (`migrate-v5` added the `enabled` flag). Default statuses: Contacted, Dropped, Email Sent, WhatsApp Sent, Meeting Done, Negotiating, Closed, Lost.
- **Settings tab**, date-filtered Overview (7D/30D/Custom), and a Chart.js pipeline-breakdown bar chart.
- Files: `src/routes/notes.js`, `src/routes/settings.js`, extended `src/routes/leads.js`.

### Sub-project B — Notifications & Email (PR #3 + polish PR #4)
- **In-app:** unread badge + toast + WebAudio chime on new leads (30s polling via `GET /api/leads/new-since`).
- **Web Push (PWA):** out-of-app phone notifications via `public/sw.js` push handlers; VAPID keys auto-generated on boot (`src/services/vapid.js`). Subscriptions in `push_subscriptions` table.
- **Email (Resend):** team alert + lead confirmation on each capture (`src/services/notifications.js`). `Promise.allSettled` isolates the three channels so one failing doesn't block the others. From-address + a separate `notification_recipient` are configurable in Settings.
- Config stored in the `scraper_config` key/value table (shared store created here, reused by C and D). Services: `src/services/config-store.js`.
- **Polish PR #4:** pipeline toggle (not delete), collapsible settings cards, mobile leads grid, `DELETE /api/leads/:id`, Gmail-recipient field.
- **Pending user action:** verify `3dvisualpro.com` DNS in Resend (SPF/DKIM/DMARC) to send from `john.alexander@3dvisualpro.com`. Domain/email is hosted at **Rumahweb**. Until then, test mode uses `onboarding@resend.dev` → a recipient inbox.

### Sub-project C — Scraper Integration (PR #5, + redesign PR #10)
- **Google Maps scraper** (Node port of the Python `scrape.py`) using `@googlemaps/google-maps-services-js`. `scraped_leads` table + `leads.website` column (`migrate-v6`). Six config keys in `scraper_config`.
- **Chunked execution:** the browser loops (category × city) and POSTs each chunk to `POST /api/scraper/run-chunk` (one search per call, ~3–6s, within Vercel's timeout). Dedup by `place_id`. Transfer a scraped row into the main `leads` table via a modal.
- **Scraper tab** (exec-dashboard layout from PR #10): stat cards, two-column Config+Targeting / Run+live-log, full-width results table.
- **Country/city selection (PR #10):** region-grouped country dropdown (~90 countries) with curated per-country city suggestions; adding a country seeds 3 starter cities. All targeting changes **auto-save**.
- **Key fixes in PR #10:** (a) Run used to reload config from the DB, discarding unsaved edits and reverting to the seeded Indonesia set — now it uses the on-screen auto-saved config; (b) the `prefer_mobile` filter used an Indonesia-only phone regex that silently dropped every non-Indonesian number — now the strict filter applies only to Indonesia, other countries keep all numbers. Routes: `src/routes/scraper.js`, service: `src/services/scraper.js`.

### Sub-project D — Layer 3 Intelligence (PR #7)
- **Versioned intelligence:** Aria's persona is locked in `src/services/aria-core-prompt.md` (only code commits change it); dynamic `lessons_learned` + `scoring_rules` come from the active row in `intelligence_versions`. Chat + qualifier read the active version (60s in-memory cache, `src/services/intelligence.js`). `migrate-v7` seeds v1 active with a SHA-256 `core_hash` so prompt drift is detectable.
- **Lifecycle:** `pending → active → archived/rejected` with a partial unique index enforcing one active version. Publish/reject/rollback via `src/routes/intelligence.js` (11 routes). `lead_tags` table (exemplary/problematic) + `leads.signals_observed` JSON column feed the analytics.
- **Intelligence tab** (5 sub-tabs): Current / Pending / History / Tags / Analytics (Chart.js, with Previous/Quarter/Year comparison deltas).
- **Monthly workspace (Layer 2):** `C:\Users\ADMIN\Documents\JA\JALAI-Workspaces\delivery\clients\3d-visual-pro\intelligence\` mirrors the JALAI `_template/intelligence/` pattern (CLAUDE.md, CONTEXT.md, 3 stages, 10-stage monthly-analysis prompt, intelligence-asset.md). Bridge scripts `pull-from-mc.js` (caches analytics/leads/tags/active version) and `push-to-mc.js` (POSTs a candidate → arrives as `pending`). **Note:** JALAI-Workspaces is not a git repo — those files live on disk only.

### Follow-up UI PRs
- **PR #8:** Intelligence nav button moved under Overview. Order: Overview · Intelligence · Leads · Follow-ups · Export · Scraper · Settings.
- **PR #9:** mobile Leads table scrolls horizontally (all 7 columns retained) instead of the previous broken hide-columns layout.

**MC nav order (desktop sidebar + mobile bottom-bar):** Overview · Intelligence · Leads · Follow-ups · Export · Scraper · Settings.

---

## Known Issues / Bugs
- **Resend not yet sending from the real domain.** `3dvisualpro.com` DNS (at Rumahweb) needs SPF/DKIM/DMARC records added + verified in Resend before team/confirmation emails can send from `john.alexander@3dvisualpro.com`. Until then use test mode (`onboarding@resend.dev`).
- **`meeting_done` funnel stage** in the intelligence analytics has no backing DB signal yet, so it always reports 0.

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
| `src/routes/leads.js` | Full leads CRUD + stats + CSV export + manual entry + bulk import |
| `src/routes/followup.js` | Follow-up regenerate + edit/mark-sent |
| `src/routes/market.js` | GET /api/market — server-side proxy for crypto, stocks, commodities (1hr cache) |
| `src/routes/notes.js` | Timestamped lead notes log (Sub-A) |
| `src/routes/settings.js` | Pipeline statuses + notification settings (Sub-A/B) |
| `src/routes/notifications.js` | Web Push subscribe/unsubscribe + VAPID public key (Sub-B) |
| `src/routes/scraper.js` | 6 routes under `/api/scraper/*` — config, run-chunk, leads list/status, transfer (Sub-C) |
| `src/routes/intelligence.js` | 11 routes — lead tags + intelligence versions + analytics (Sub-D) |
| `src/services/config-store.js` | Key/value read/write over the `scraper_config` table (shared by B/C/D) |
| `src/services/vapid.js` | Generates + persists VAPID keys on first boot (Sub-B) |
| `src/services/notifications.js` | Orchestrates web push + team email + lead confirmation (Sub-B) |
| `src/services/scraper.js` | Google Places wrappers: searchBusinesses, getPlaceDetails, isMobileNumber (Sub-C) |
| `src/services/intelligence.js` | Active-version cache + prompt/qualifier builders (Sub-D) |
| `src/services/aria-core-prompt.md` | Locked Aria persona/flow — only code commits change it (Sub-D) |
| `scripts/migrate-v2..v7.js` | Standalone idempotent Turso migrations (run manually before merge) |

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
| `docs/superpowers/specs/2026-03-29-v2.2-revisions-design.md` | v2.2 revisions design spec |
| `docs/superpowers/plans/2026-03-29-v2.2-revisions.md` | v2.2 implementation plan (10 tasks) |
| `.env.example` | Environment variable template |

> **Mission Control Expansion (A/B/C/D) specs + plans live in the landing-page repo**, not here: `3D Visual Pro/docs/superpowers/specs/` and `.../plans/` (e.g. `2026-05-06-mc-scraper-integration-design.md`, `2026-05-12-mc-scraper-integration.md`, `2026-05-10-mc-intelligence-layer-design.md`, `2026-05-12-mc-intelligence-layer.md`). The cross-project handover is `3D Visual Pro/Handover.md` (covers the WordPress landing page too).

### Tests
| File | Covers |
|------|--------|
| `tests/auth.test.js` | Auth middleware (missing token, wrong token, valid token, unset ADMIN_TOKEN) |
| `tests/ai.test.js` | AI service (unknown provider, Groq adapter) |
| `tests/chat.test.js` | Chat route (session creation, AI replies, signal stripping) |
| `tests/leads.test.js` | Leads routes (capture, list, stats, export, status update, manual entry, bulk import) |
| `tests/followup.test.js` | Follow-up routes (auth, regenerate, edit/mark-sent) |

---

## Live URLs
- **Landing page / API:** https://lead-capture-chatbot-beta.vercel.app
- **Mission Control admin:** https://lead-capture-chatbot-beta.vercel.app/admin/
- **Widget demo:** https://lead-capture-chatbot-beta.vercel.app/widget.html
- **GitHub:** https://github.com/jalookout7-eng/lead-capture-chatbot
- **Legacy (ignore):** https://lead-capture-chatbot.onrender.com (old Render deploy)

## Environment Variables
See `.env.example`. All must be set in the Vercel dashboard (Settings → Environment Variables):
- `AI_PROVIDER` — `groq`
- `AI_MODEL` — `llama-3.1-8b-instant`
- `AI_API_KEY` — Groq API key
- `TURSO_URL` — `libsql://3d-visual-pro-3dvisualpro.aws-ap-northeast-1.turso.io`
- `TURSO_TOKEN` — Turso auth token
- `ADMIN_TOKEN` — password for admin dashboard access

Notes: VAPID keys for Web Push are generated on first boot and stored in `scraper_config` (no env var needed). Resend API key + Google Places API key are entered through the MC Settings/Scraper UI (stored in `scraper_config`), not via env vars.

## Running Locally
1. Copy `.env.example` to `.env` and fill in values
2. `npm install`
3. `npm run dev`
4. Open http://localhost:3000
5. To apply a schema change locally/prod: `TURSO_URL=... TURSO_TOKEN=... node scripts/migrate-vN.js`

## Running Tests
`npm test` — expects **188 tests passing across 15 suites**.

---

## Next Steps
1. **Finish Resend email setup** — add SPF/DKIM/DMARC for `3dvisualpro.com` at Rumahweb, verify the domain in Resend, then set From = `john.alexander@3dvisualpro.com` and clear the test recipient. (Receiving inbox `john.alexander@3dvisualpro.com` already exists on Rumahweb webmail.) Smoke-test team alert + lead confirmation.
2. **Scraper smoke test** — open Scraper tab, set Google Places API key, add a country (e.g. United Arab Emirates), confirm cities/districts (Dubai, DIFC, Downtown Dubai), set categories, Run → confirm leads appear and Transfer works.
3. **Intelligence smoke test** — capture a fresh lead via Aria, confirm `signals_observed` populates; push a candidate version from the JALAI workspace via `push-to-mc.js`; Publish and confirm Aria picks up new lessons within 60s.
4. **First monthly intelligence cycle** — run `pull-from-mc.js`, work the 10-stage monthly-analysis prompt, produce a candidate, review + publish.
5. **Stale-lead automated follow-up** — the only original email trigger not yet built: if no status change after 2 days, send a follow-up (needs a scheduled task / Vercel cron).
6. **Embed chatbot on WordPress** — drop the widget into an Elementor HTML widget on 3dvisualpro.com, set API base to the Vercel URL, configure CORS.
7. **Team photos** (landing page) — swap the 3 staging URLs to production once uploaded.
