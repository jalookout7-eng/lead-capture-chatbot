# Handover — 3D Visual Pro Lead Capture & Chatbot System

## What This Is
3D Visual Pro's production lead capture and management system. Visitors to the landing page chat with an AI assistant that discovers their business needs through one-question-at-a-time conversation, captures their details (name, email, mobile with country code), qualifies them, and generates personalised follow-up messages. The team manages leads via a PWA admin dashboard.

## Business Context
- **Company**: 3D Visual Pro (3D VP) — 3D virtual tours business in Indonesia, expanding into AI automation, modern websites, digital marketing, and business consultancy
- **Team**: Farhan Rais Satria (Digital Marketing & Strategy), Wassim Reghis (AI Agents & Automation), John Alexander (CRM & Client Operations) — all based in Dubai
- **Services**: Paid digital advertising, AI WhatsApp agents, CRM management, modern website builds, business consultancy
- **Target audience**: Global businesses (not limited to Indonesian property developers)
- **Pricing model**: Project setup fee + monthly retainer
- **Guarantee**: 80% refund on setup fee if quality not delivered (20% covers infrastructure)

## v1 Status (COMPLETE)
All backend routes, tests (17/17 passing), landing page, floating widget, and admin PWA built and deployed.

## v2 Improvements (IN PROGRESS — design approved, pending implementation plan)
**Spec:** `docs/superpowers/specs/2026-03-27-v2-improvements-design.md`

1. **Landing page redesign** — Full editorial (hero, problem, services, process, why us, team, CTA) matching 3D Visual Pro brand. Floating chatbot widget with ping animation. Self-contained CSS (.dvp namespace) for future embedding on 3dvisualpro.com via Elementor.
2. **Chatbot AI rewrite** — New system prompt: one question per turn, consultative tone (no selling), 3D Visual Pro team assistant identity, 4 discovery paths (AI automation, websites, digital marketing, general), min 4 exchanges before capture.
3. **Admin dashboard redesign** — Dark + neon mission control (#0a0a1a bg, #00ffc8 cyan accents, monospace numbers, glowing borders). No emojis — text labels for scores.
4. **Database updates** — Add `phone` and `notes` columns to leads table. New PATCH /api/leads/:id/notes endpoint. Updated capture form with phone + country code.
5. **Bug fixes** — Overview stats not rendering for existing leads. Updated product enum (add `marketing`, `consultancy`).
6. **No emojis** — Removed from all UI, code, and admin dashboard.

## Current Stack
- Node.js + Express (single server)
- Turso (hosted SQLite) — @libsql/client
- Groq + Llama 3.1 8B (swappable via AI_PROVIDER env var)
- HTML + Tailwind CSS (CDN)
- Deployed on Render, source on GitHub

## Key Files
- `src/server.js` — entry point
- `src/services/ai.js` — AI abstraction (swap provider here)
- `src/routes/` — all API routes (chat.js, leads.js, followup.js)
- `src/services/qualifier.js` — AI lead scoring
- `src/middleware/auth.js` — bearer token auth
- `public/index.html` — landing page with chatbot
- `public/widget.html` — floating widget demo
- `public/admin/index.html` — admin PWA dashboard
- `3DVISUALPRO.txt` — existing WordPress landing page (brand reference)
- `docs/superpowers/specs/2026-03-27-lead-capture-chatbot-design.md` — v1 design spec
- `docs/superpowers/plans/2026-03-27-lead-capture-chatbot.md` — v1 implementation plan

## Live URLs
- Landing page: https://lead-capture-chatbot.onrender.com
- Admin dashboard: https://lead-capture-chatbot.onrender.com/admin/
- Widget demo: https://lead-capture-chatbot.onrender.com/widget.html
- GitHub: https://github.com/jalookout7-eng/lead-capture-chatbot

## Environment Variables
See `.env.example` — set these on Render before deploying.

## Running Locally
1. Copy `.env.example` to `.env` and fill in values
2. `npm install`
3. `npm run dev`
4. Open http://localhost:3000

## Running Tests
`npm test`
