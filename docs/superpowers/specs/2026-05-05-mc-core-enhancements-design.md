# Mission Control — Core Enhancements Design Spec

**Date:** 2026-05-05
**Status:** Approved
**Repo:** jalookout7-eng/lead-capture-chatbot
**Sub-project:** A of 3 (Notes · Custom Statuses · Pipeline Charts)

---

## Overview

Adds three functional enhancements to the existing Mission Control admin dashboard. No visual redesign — existing dark-theme MC aesthetic is preserved exactly.

| Feature | What it adds |
|---------|-------------|
| Timestamped notes log | Per-lead notes with date/time, replacing the single `notes` text field |
| Pipeline status | Configurable status field per lead, managed from a new Settings tab |
| Interactive charts | Date-filtered overview: leads-by-day + pipeline breakdown |

---

## Database

Three schema changes applied by `scripts/migrate-v2.js`.

### New table: `lead_notes`

```sql
CREATE TABLE IF NOT EXISTS lead_notes (
  id         TEXT PRIMARY KEY,
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
```

Replaces the existing single `notes` TEXT column on `leads` for new entries. The old `notes` column is left in place (SQLite cannot drop columns) but is no longer written to.

### New table: `pipeline_status_options`

```sql
CREATE TABLE IF NOT EXISTS pipeline_status_options (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
```

Eight defaults seeded by the migration script (skipped if already present):
`Contacted`, `Dropped`, `Email Sent`, `WhatsApp Sent`, `Meeting Done`, `Negotiating`, `Closed`, `Lost`

### New column: `leads.pipeline_status`

```sql
ALTER TABLE leads ADD COLUMN pipeline_status TEXT DEFAULT NULL;
```

Stores the currently selected pipeline status label for each lead. NULL = unset. Existing `score` (hot/warm/cold) and `status` (new/contacted/converted/closed) columns are untouched.

---

## API Routes

### New file: `src/routes/notes.js`

All endpoints require auth middleware.

**`GET /api/leads/:id/notes`**
- Fetches all notes for the lead, ordered `created_at DESC` (newest first)
- Returns: `{ notes: [{ id, lead_id, content, created_at }] }`
- 404 if lead not found

**`POST /api/leads/:id/notes`**
- Body: `{ content: string }` (required, non-empty)
- Generates UUID for `id`, sets `created_at` to current ISO timestamp
- Returns: `{ note: { id, lead_id, content, created_at } }` with status 201
- 400 if content missing or empty
- 404 if lead not found

### New file: `src/routes/settings.js`

All endpoints require auth middleware.

**`GET /api/settings/pipeline-statuses`**
- Returns: `{ statuses: [{ id, label, created_at }] }` ordered by `created_at ASC`

**`POST /api/settings/pipeline-statuses`**
- Body: `{ label: string }` (required, non-empty, trimmed)
- Generates UUID for `id`, sets `created_at`
- Returns: `{ status: { id, label, created_at } }` with status 201
- 400 if label missing or empty
- 409 if label already exists (UNIQUE constraint)

**`DELETE /api/settings/pipeline-statuses/:id`**
- Deletes the option. Does NOT update leads that already have this pipeline_status set.
- Returns: `{ success: true }` with status 200
- 404 if id not found

### Extensions to `src/routes/leads.js`

**New: `PATCH /api/leads/:id/pipeline-status`**
- Body: `{ pipeline_status: string | null }`
- Updates the `pipeline_status` column on the lead
- Returns: `{ success: true }`
- 404 if lead not found

**Updated: `GET /api/leads/stats`**

Gains two optional query params: `from` (YYYY-MM-DD) and `to` (YYYY-MM-DD).

- When omitted: existing behaviour unchanged (last 30 days)
- When provided: all counts and daily breakdown are filtered to `created_at BETWEEN from AND to`

Response gains one new field:
```json
{
  "total": 42,
  "hot": 12,
  "warm": 18,
  "cold": 12,
  "byDay": [...],
  "pipelineBreakdown": [
    { "label": "Email Sent", "count": 8 },
    { "label": "Meeting Done", "count": 3 }
  ]
}
```
`pipelineBreakdown` contains only pipeline statuses with count > 0, ordered by count descending. Leads with NULL pipeline_status are excluded from this array.

### Registration in `src/server.js`

```javascript
const notesRouter    = require('./routes/notes');
const settingsRouter = require('./routes/settings');
app.use('/api', notesRouter);
app.use('/api', settingsRouter);
```

---

## Admin UI (`public/admin/index.html`)

No CSS changes to existing components. All new elements follow the existing dark-theme inline style patterns already present in the file.

### 1. Settings tab

Fifth tab added to the existing nav (after Export). Label: "Settings".

Content panel contains one section — Pipeline Statuses:
- Heading: "Pipeline Statuses"
- Input field + "Add" button at the top. On submit: `POST /api/settings/pipeline-statuses`, prepends new item to list on success.
- List of current statuses. Each row: label text + "Delete" button. On delete: `DELETE /api/settings/pipeline-statuses/:id`, removes row from list on success.
- List is loaded from `GET /api/settings/pipeline-statuses` when the Settings tab is opened (lazy load, not on page load).

### 2. Lead detail view — notes panel

Appears above the conversation transcript when a lead detail panel is open.

- Section heading: "Notes"
- Notes list (newest first): each entry shows note content + formatted date/time (`DD MMM YYYY, HH:MM`)
- If no notes: shows "No notes yet."
- Below list: textarea (3 rows) + "Add Note" button. On submit: `POST /api/leads/:id/notes`, prepends new note to top of list on success. Clears textarea.
- Notes are loaded as part of the existing `GET /api/leads/:id` detail fetch, supplemented by a separate `GET /api/leads/:id/notes` call.

### 3. Leads table — pipeline status column

New column added after the existing "Status" column. Header: "Pipeline".

- Displays current `pipeline_status` value or "—" if null.
- Clicking the cell opens an inline `<select>` populated from the cached pipeline status options list (fetched once on page load from `GET /api/settings/pipeline-statuses`).
- On change: fires `PATCH /api/leads/:id/pipeline-status`, updates the cell text on success.

### 4. Overview tab — date filter + pipeline chart

**Date filter bar** — rendered above the existing stat cards:
- Three toggle buttons: "7D" | "30D" | "Custom"
- Default: "30D" (matches existing behaviour)
- When "Custom" is selected: two date inputs (`from`, `to`) appear inline
- On any change: refetches `GET /api/leads/stats?from=&to=` and updates all four elements below

**Stat cards** — existing four cards (Total, Hot, Warm, Cold) updated from the refetched response.

**Leads-by-day chart** — existing chart updated from the refetched `byDay` data using its current rendering approach.

**Pipeline breakdown chart** — new chart below the leads-by-day chart:
- Renders `pipelineBreakdown` from the stats response
- Horizontal bar chart using Chart.js (loaded from CDN: `https://cdn.jsdelivr.net/npm/chart.js`)
- Shows count per pipeline status, ordered by count descending
- If `pipelineBreakdown` is empty: shows "No pipeline data for this period." text instead of chart
- Chart colours follow existing MC accent palette

---

## Migration Script (`scripts/migrate-v2.js`)

Run with: `TURSO_URL=... TURSO_TOKEN=... node scripts/migrate-v2.js`

Steps in order:
1. `CREATE TABLE IF NOT EXISTS lead_notes ...`
2. `CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ...`
3. `CREATE TABLE IF NOT EXISTS pipeline_status_options ...`
4. `ALTER TABLE leads ADD COLUMN pipeline_status TEXT DEFAULT NULL` — wrapped in try/catch, skipped silently if column already exists
5. Seed the seven default pipeline status options (INSERT OR IGNORE to skip duplicates)
6. Log success for each step

---

## Spec Self-Review

**Placeholder scan:** No TBDs. All endpoints, fields, and UI behaviours are fully specified.

**Internal consistency:**
- `pipelineBreakdown` uses `label` not `id` — consistent with how the leads table stores `pipeline_status` as a label string (not a foreign key). This is intentional: if a status option is deleted, existing leads retain their label value without breaking.
- `GET /api/leads/:id` detail fetch + separate `GET /api/leads/:id/notes` call — slight over-fetching. Acceptable; notes can be added without reopening the detail panel.
- Chart.js loaded from CDN — only loaded when the admin dashboard is opened. No impact on landing page or chatbot.

**Scope check:** Focused on one sub-project. Does not touch Sub-project B (email/Resend) or Sub-project C (scraper). Settings page only covers pipeline statuses; Resend config and scraper settings are deferred to their respective sub-projects.

**Ambiguity check:**
- "Delete status does not update existing leads" — explicit. Leads with a deleted status label retain the label as a string; it just won't appear in the dropdown anymore.
- "Pipeline status stored as label string not foreign key" — explicit. Avoids cascade issues on delete.
- Date filter default (30D) matches existing behaviour — no breaking change to the stats endpoint when params are omitted.

---

## Future: Layer 3 Intelligence — Aria Learning System

**Status: Deferred — design only, not part of Sub-project A implementation.**

This section describes the architecture for making Aria a self-improving qualifier. It is included here because the data foundation (notes, pipeline statuses) built in Sub-project A is what makes it possible.

### Concept

Aria currently asks scripted questions and routes based on keyword patterns. Layer 3 upgrades this: Aria builds a private knowledge base of what signals reliably predict lead quality — which questions draw out the most useful answers, which phrases indicate strong intent, which situations consistently lead to closed deals vs. wasted time. This database grows with every conversation and outcome tracked in Mission Control.

### Data model

New table: `aria_signal_memory`

```sql
CREATE TABLE IF NOT EXISTS aria_signal_memory (
  id            TEXT PRIMARY KEY,
  signal_type   TEXT NOT NULL,  -- 'question_effectiveness' | 'intent_indicator' | 'disqualifier' | 'segment_pattern'
  signal_key    TEXT NOT NULL,  -- e.g. "uses_whatsapp_only", "no_follow_up_system", "meta_ads_low_quality"
  description   TEXT NOT NULL,  -- human-readable summary of the pattern
  strength      REAL NOT NULL DEFAULT 0.5,  -- 0.0 (weak signal) to 1.0 (strong predictor)
  outcome       TEXT,           -- 'hot' | 'warm' | 'cold' | 'converted' | 'lost'
  sample_count  INTEGER NOT NULL DEFAULT 1,
  last_updated  TEXT NOT NULL
);
```

Alternatively, a flat JSON file stored in a private GitHub repo (e.g. `jalookout7-eng/aria-memory`) updated by Mission Control when leads are marked as converted or lost. Either approach works — Turso is simpler (no GitHub dependency), GitHub is human-readable and version-controlled.

**Recommended:** Turso table. Simpler operationally. The team can view/edit signals directly from a future MC "Aria Memory" tab.

### How it works

1. **Signal capture** — When a lead's pipeline status is updated to `Closed` or `Lost` in Mission Control, MC offers a one-click prompt: "What was the key signal?" with a short free-text field. This is written to `aria_signal_memory`.

2. **Pattern injection** — A new `GET /api/aria/memory` endpoint returns the top 20 strongest signals (by `strength × sample_count`). These are injected into Aria's system prompt as a dynamic appendix: *"Based on past conversations, these patterns predict strong leads: [signals]. These predict poor fit: [disqualifiers]."*

3. **Strength updates** — When a signal is confirmed by a new outcome (e.g. "uses WhatsApp only" → lead closed again), its `strength` increases. When contradicted, it decreases. A simple weighted average over `sample_count`.

4. **Human review** — Signals are not auto-applied above a threshold without review. The MC "Aria Memory" tab (future Sub-project D) shows all signals with their strength scores so the team can delete noise, rename patterns, and flag anything that seems wrong.

### What this enables

- Aria asks follow-up questions more strategically for situations similar to past strong leads
- Aria learns to route certain answer patterns to `SEGMENT:crm` vs `SEGMENT:ads` based on actual conversion data, not just keywords
- Pipeline statuses from Sub-project A become the ground truth: "contacted → meeting done → closed" chains train the strongest signals
- Over time, Aria's cold/warm/hot scoring becomes calibrated to 3D Visual Pro's actual client patterns, not generic defaults

### Implementation order

This is **Sub-project D**. It depends on:
- Sub-project A (pipeline statuses, notes — for outcome tracking)
- At least 3–6 months of real lead data in Mission Control

Do not implement until there is meaningful data to learn from.
