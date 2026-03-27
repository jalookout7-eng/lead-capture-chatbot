# Handover — Lead Capture & Chatbot System

## What This Is
John's production lead management system. Visitors chat with an AI that discovers their business needs, captures their details, and qualifies them. John manages leads via a PWA admin dashboard.

## Current Status
- [x] Task 1: Project scaffold — DONE
- [x] Task 2: Database setup — DONE
- [x] Task 3: AI service abstraction — DONE
- [x] Task 4: Auth middleware — DONE
- [x] Task 5: Chat route — DONE
- [x] Task 6: Qualifier service — DONE
- [x] Task 7: Leads routes — DONE
- [x] Task 8: Follow-up routes — DONE
- [x] Task 9: Landing page with chatbot — DONE
- [x] Task 10: Floating widget — DONE
- [x] Task 11: Admin dashboard PWA — DONE
- [x] Task 12: GitHub repo setup — DONE (https://github.com/jalookout7-eng/lead-capture-chatbot)
- [x] Task 13: Render deployment — DONE (https://lead-capture-chatbot.onrender.com)
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

## Live URL
https://lead-capture-chatbot.onrender.com
Admin dashboard: https://lead-capture-chatbot.onrender.com/admin/

## Running Locally
1. Copy `.env.example` to `.env` and fill in values
2. `npm install`
3. `npm run dev`
4. Open http://localhost:3000

## Running Tests
`npm test`
