# Handover — Lead Capture & Chatbot System

## What This Is
John's production lead management system. Visitors chat with an AI that discovers their business needs, captures their details, and qualifies them. John manages leads via a PWA admin dashboard.

## Current Status
- [x] Task 1: Project scaffold — DONE
- [ ] Task 2: Database setup
- [ ] Task 3: AI service abstraction
- [ ] Task 4: Auth middleware
- [ ] Task 5: Chat route
- [ ] Task 6: Qualifier service
- [ ] Task 7: Leads routes
- [ ] Task 8: Follow-up routes
- [ ] Task 9: Landing page with chatbot
- [ ] Task 10: Floating widget
- [ ] Task 11: Admin dashboard PWA
- [ ] Task 12: GitHub repo setup
- [ ] Task 13: Render deployment
- [ ] Task 14: Full test suite + smoke test

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
- `docs/superpowers/plans/2026-03-27-lead-capture-chatbot.md` — implementation plan

## Environment Variables
See `.env.example` — set these on Render before deploying.

## Running Locally
1. Copy `.env.example` to `.env` and fill in values
2. `npm install`
3. `npm run dev`
4. Open http://localhost:3000

## Running Tests
`npm test`
