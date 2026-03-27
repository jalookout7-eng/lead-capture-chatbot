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

## v2 Improvements (IN PROGRESS — brainstorming phase)
- **Rebrand**: "John's AI Services" -> "3D Visual Pro" — match existing brand colors (#007bff blue, #1a1a2e dark navy, #00c853 green) and fonts (Montserrat, Plus Jakarta Sans)
- **Landing page redesign**: Bold promise, 80% refund guarantee, 3D Visual Pro branding, chatbot embedded
- **Admin dashboard redesign**: Dark + neon futuristic "mission control" aesthetic (#0a0a1a background, cyan/green glowing accents, monospace numbers)
- **Chatbot AI fixes**:
  - One question per message (not multiple)
  - Consultative tone, not salesy — don't pitch during discovery
  - Capture form only triggers after discovery is genuinely complete
  - Add mobile number field with country code to capture form
- **Add notes field**: Admin can add personal notes/comments to leads
- **Fix overview stats bug**: Test lead shows in Leads tab but not in Overview stats/chart
- **No emojis**: Anywhere in the UI or code

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
