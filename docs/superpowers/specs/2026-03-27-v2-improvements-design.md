# 3D Visual Pro Lead Capture System — v2 Improvements Design Spec

**Date:** 2026-03-27
**Owner:** John (3D Visual Pro)
**Status:** Approved

---

## 1. Overview

v2 rebrands the system from "John's AI Services" to **3D Visual Pro** and delivers four areas of improvement: a full editorial landing page with floating chatbot, a rewritten AI conversation flow, a dark neon mission control admin dashboard, and database schema updates for phone and notes fields.

The system remains deployed on Render with Turso and Groq. The landing page is built self-contained (namespaced CSS, configurable API base URL) so it can later be embedded on the official 3dvisualpro.com WordPress site via Elementor HTML widget.

---

## 2. Business Context

**Company:** 3D Visual Pro (3D VP) — originally a 3D virtual tours business in Indonesia, now expanding into AI automation, modern websites, digital marketing, and business consultancy. Team of 3 based in Dubai: Farhan Rais Satria (Digital Marketing & Strategy), Wassim Reghis (AI Agents & Automation), John Alexander (CRM & Client Operations).

**Services:**
- AI chatbots & automation systems
- Modern websites & landing pages
- Paid digital advertising (Meta, Google, LinkedIn)
- CRM management & setup
- Business consultancy

**Pricing:** Project setup fee + monthly retainer.
**Guarantee:** 80% refund on setup fee if quality service not delivered (20% covers infrastructure costs).
**Target audience:** Global businesses (not limited to Indonesian property developers).

---

## 3. Landing Page Redesign

### Brand Identity
- **Colors:** `#007bff` (blue primary), `#339cff` (blue hover), `#1a1a2e` (dark navy), `#00c853` (green success), `#ffffff` (white background)
- **Fonts:** Montserrat (headings, 700/800 weight), Plus Jakarta Sans (body, 400/600 weight)
- **CSS namespace:** `.dvp` prefix on all classes (matches existing WordPress page for future embedding)
- **Approach:** Self-contained HTML/CSS that can be dropped into an Elementor HTML widget. API calls use a configurable `API_BASE` variable (defaults to `''` for same-origin, set to Render URL when embedded on WordPress).

### Page Structure

**1. Hero Section**
- Section label: "AI-Powered Business Solutions"
- Bold headline using Montserrat 700: "Your business runs on manual processes. **It doesn't have to.**" (or similar — blue span on key phrase)
- Sub-copy: 2-3 sentences explaining what 3D Visual Pro does
- Stats bar: 3 key stats (e.g., "60s AI response time", "24/7 lead capture", "80% refund guarantee")
- Two CTAs: "Talk to Our AI Assistant" (scrolls to chatbot / opens widget) + "See Our Services" (scrolls to services)
- Guarantee badge: Prominently displayed — "80% Money-Back Guarantee on Setup Fee"

**2. Problem Section**
- Section label: "The Problem"
- Headline: "Your leads are disappearing. Here's why."
- 4-card grid (broadened beyond property developers):
  - Slow lead response (leads go cold in minutes)
  - No lead tracking system (spreadsheets, lost WhatsApp messages)
  - No digital advertising strategy (relying on referrals)
  - No automation (every response is manual)
- Each card has: icon (SVG), title, description, stat badge

**3. Services Section**
- Section label: "Our Services"
- Headline: "4 services. Managed from Dubai."
- 4 service cards:
  - SERVICE 01: AI Chatbots & Automation — 24/7 lead capture, qualification, follow-up
  - SERVICE 02: Modern Websites & Landing Pages — fast build, conversion-focused
  - SERVICE 03: Paid Digital Advertising — Meta, Google, LinkedIn, fully managed
  - SERVICE 04: Business Consultancy — audit-first approach, strategy backed by implementation

**4. How It Works**
- Section label: "How It Works"
- Headline: "From audit to active leads in 30 days."
- Process table (desktop) / cards (mobile):
  - Step 1: Free Strategy Call (Day 1)
  - Step 2: Business Audit (Days 2-7)
  - Step 3: Fix Gaps & Build (Weeks 2-4)
  - Step 4: Launch (Month 2)
  - Step 5: Scale & Optimise (Month 3+)

**5. Why Choose Us**
- Section label: "Why Choose Us"
- 3-card grid:
  - Proven by Dubai's fastest-growing companies
  - Implementation, not consultation
  - 80% refund guarantee — we put our money where our mouth is

**6. Team Section**
- Section label: "Who We Are"
- Headline: "A Dubai-based team with one focus: your growth."
- 3 team member cards with photos (reuse existing WordPress image URLs), names, roles

**7. Final CTA**
- Dark background (#1a1a2e)
- Headline: "Stop guessing. Start converting."
- Sub-copy + CTA button that opens the chatbot widget

**8. Floating Chatbot Widget**
- Fixed position, bottom-right corner
- Collapsed state: circular button with chat icon, subtle pulse/ping animation on load to draw attention
- Expanded state: 380x500px floating panel with chat header, messages, input area, capture form
- Same chat logic as v1 but with updated capture form (name, email, phone with country code)
- `API_BASE` variable for configurable endpoint URL

### Responsiveness
- Follow existing 3D Visual Pro responsive breakpoints (900px, 700px)
- Hero form card hidden on mobile (< 900px)
- Service/problem grids collapse to single column on mobile
- Process table becomes cards on mobile (< 700px)
- Chatbot widget works full-width on mobile

---

## 4. Chatbot AI Behavior

### System Prompt Rewrite

**Identity:**
- Introduces as "the 3D Visual Pro assistant"
- Speaks as "we" / "our team" — never names individual team members during chat
- Tone: curious, consultative, professional but warm

**Conversation Rules:**
- One question per message, always — never ask multiple questions in one response
- 2-3 sentences maximum per response (token efficiency)
- Never pitch or sell during discovery — no "we've helped many businesses" or "our team has great success"
- Never ask about budget or timeline
- Goal: understand the business fully so the team can identify opportunities

**Discovery Paths:**

*AI Automation / Chatbots:*
1. What does your business do and who do you serve?
2. How do customers typically interact with you?
3. What tools/systems do you use day-to-day?
4. Where do things slow down or fall through the cracks?

*Modern Websites:*
1. What does your business do?
2. Do you have an existing website? What's working/not working?
3. What's the main goal — leads, information, online sales?
4. Who's your target audience?

*Digital Marketing:*
1. What does your business do?
2. What marketing channels are you currently using?
3. What's worked and what hasn't?
4. Who's your ideal customer?

*General / Not Sure:*
1. What does your business do?
2. What's taking up most of your team's time right now?
3. Where do things tend to slow down? (AI identifies relevant service from response)
4. Continues with the matched service's discovery path

**Product Signal:**
- `PRODUCT:<type>` emitted once the AI identifies the relevant service
- Types: `ai_service`, `website`, `marketing`, `consultancy`, `other`

**Capture Trigger:**
- Minimum 4 user-AI exchanges before `CAPTURE_READY` can fire
- Only triggers after the AI's final discovery response — never embedded within a question
- The AI should have enough context to generate a meaningful summary before triggering

---

## 5. Admin Dashboard — Dark + Neon Mission Control

### Visual Style
| Element | Value |
|---|---|
| Background | `#0a0a1a` |
| Card/panel background | `rgba(0, 255, 200, 0.05)` |
| Card borders | `1px solid rgba(0, 255, 200, 0.15)` |
| Primary accent | `#00ffc8` (cyan-green neon) |
| Hot score | `#ff3232` (red) |
| Warm score | `#ffb400` (amber) |
| Cold score | `#00ffc8` (cyan) |
| Numbers/data | `font-family: 'Courier New', monospace` |
| Text primary | `rgba(255, 255, 255, 0.9)` |
| Text secondary | `rgba(255, 255, 255, 0.5)` |
| Active nav | Neon border/background highlight |
| Score indicators | Colored text labels (HOT, WARM, COLD) — no emojis |

### Layout
Same tab structure as v1 (Overview, Leads, Follow-ups, Export) but with the neon aesthetic applied throughout.

**Overview tab:**
- 4 stat cards with glowing neon borders: Total, Hot, Warm, Cold
- Bar chart with gradient neon bars (leads per day)
- Fix existing stats bug: ensure leadsByDay data renders correctly in the chart

**Leads tab:**
- Searchable table with neon score badges and status dropdown
- Click row to expand detail view:
  - AI summary, bottlenecks list, conversation thread
  - Phone number displayed
  - **New: Notes textarea** — editable, auto-saves on blur
- Truncated notes preview column in the table

**Follow-ups tab:**
- List of pending follow-ups (followup_sent = 0)
- Editable textarea for follow-up message
- Save Draft + Mark Sent buttons

**Export tab:**
- Single CSV download button (now includes phone and notes columns)

### Mobile
- Bottom nav (same as v1) with neon styling
- Content stacks single-column
- Lead detail view goes full-width

---

## 6. Database Changes

### New Columns
```sql
ALTER TABLE leads ADD COLUMN phone TEXT;
ALTER TABLE leads ADD COLUMN notes TEXT;
```

Run as part of `initDb()` in `src/db/client.js` — appropriate for current scale. No migration framework needed.

### Updated Product Enum
The `product` field now accepts: `ai_service`, `website`, `marketing`, `consultancy`, `other`

---

## 7. API Changes

### Updated Routes
| Method | Route | Change |
|---|---|---|
| `POST` | `/api/leads` | Accepts `phone` field in request body |
| `GET` | `/api/leads` | Returns `phone` and `notes` in response |
| `GET` | `/api/leads/:id` | Returns `phone` and `notes` in response |
| `PATCH` | `/api/leads/:id/notes` | **New** — saves admin notes (auth required) |
| `GET` | `/api/export` | CSV now includes `phone` and `notes` columns |

### Notes Endpoint
```
PATCH /api/leads/:id/notes
Auth: Bearer token required
Body: { "notes": "string" }
Response: Updated lead record
```

---

## 8. Chatbot Widget — Embeddability

The floating chatbot widget is built as a self-contained component that can work on any page:

```js
// Configuration — set before loading the widget
window.DVP_CHAT_CONFIG = {
  apiBase: '',  // default: same-origin. Set to 'https://lead-capture-chatbot.onrender.com' when embedded on WordPress
};
```

When embedded on 3dvisualpro.com later:
1. Add the widget HTML/JS/CSS to an Elementor HTML widget
2. Set `apiBase` to the Render URL
3. Configure CORS on the Express server to allow the WordPress domain

The Express server will need a CORS update to accept requests from the official domain when that time comes (out of scope for now, but the widget is built ready for it).

---

## 9. Files Affected

### Modified
- `src/db/client.js` — add ALTER TABLE statements to `initDb()`
- `src/db/schema.sql` — add `phone` and `notes` columns to reference schema
- `src/routes/chat.js` — rewrite SYSTEM_PROMPT, add `marketing` and `consultancy` to product signal regex
- `src/routes/leads.js` — accept `phone` in POST, return `phone`/`notes` in GET, add PATCH notes endpoint, update CSV export
- `src/services/qualifier.js` — update qualifier prompt for new service types
- `public/index.html` — full rewrite: 3D Visual Pro editorial landing page
- `public/widget.html` — update to match new branding and capture form (add phone field)
- `public/admin/index.html` — full rewrite: dark neon mission control
- `public/admin/manifest.json` — update name/theme if needed
- `tests/` — update tests for new fields, new endpoint, updated product types

### New
- None (all changes are modifications to existing files)

---

## 10. Out of Scope (Future)

- Visitor analytics / page view tracking
- Automated email/WhatsApp follow-up via AI agent
- CORS configuration for WordPress embedding
- Upgrading AI provider to Claude/GPT-4
- Multi-user admin access with roles
