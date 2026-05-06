# Mission Control — Scraper Integration Design Spec

**Date:** 2026-05-06
**Status:** Approved
**Repo:** jalookout7-eng/lead-capture-chatbot
**Sub-project:** C of 3 (Scraper Integration)

---

## Overview

Ports the existing Python Google Maps scraper (`jalai-delivery/stages/00-lead-sourcing/scraper/scrape.py`) to Node.js and integrates it into Mission Control. Scraped leads live in a separate `scraped_leads` table until the team manually transfers qualified ones to the main `leads` table. The scraper runs in chunks (one category + city per Vercel function call) to stay within Vercel's serverless timeout. Triggered from a new Scraper tab in the MC dashboard.

No design changes to existing MC UI — new tab follows the existing dark-theme aesthetic.

---

## Architecture

- **Execution model:** Chunked. MC client sends one `POST /api/scraper/run-chunk` per category+city combination. Each call completes in ~3–5 seconds. Client handles the loop, tracks total inserted, stops when `max_leads_per_run` reached.
- **Data flow:** Scraper → `scraped_leads` (Turso) → manual transfer → `leads` (Turso)
- **Config storage:** `scraper_config` Turso table (key/value). Google Places API key stored here (admin-only access). No Vercel env var required.
- **Dedup:** `place_id` UNIQUE constraint on `scraped_leads`. Skipped silently on conflict.

---

## Database

Applied by `scripts/migrate-v3.js`.

### New table: `scraped_leads`

```sql
CREATE TABLE IF NOT EXISTS scraped_leads (
  id                  TEXT PRIMARY KEY,
  place_id            TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  category            TEXT,
  city                TEXT,
  country             TEXT,
  address             TEXT,
  phone               TEXT,
  website             TEXT,
  google_rating       REAL,
  total_reviews       INTEGER,
  google_maps_url     TEXT,
  status              TEXT NOT NULL DEFAULT 'New',
  transferred         INTEGER NOT NULL DEFAULT 0,
  transferred_lead_id TEXT,
  scraped_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scraped_leads_status   ON scraped_leads(status);
CREATE INDEX IF NOT EXISTS idx_scraped_leads_place_id ON scraped_leads(place_id);
```

**Status values (simplified):** `New` · `Called – No Answer` · `Called – Spoke` · `Interested` · `Not Interested`

`transferred = 1` when promoted to `leads`. `transferred_lead_id` holds the resulting `leads.id`.

### New table: `scraper_config`

```sql
CREATE TABLE IF NOT EXISTS scraper_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Keys seeded by migration (from existing `config.py` defaults):**

| Key | Type | Default |
|-----|------|---------|
| `api_key` | string | `""` (must be set from UI) |
| `categories` | JSON array | 18 categories from config.py |
| `cities` | JSON object `{ "UAE": [...], "Oman": [...] }` | UAE + Oman cities from config.py |
| `max_leads_per_run` | number string | `"15"` |
| `max_per_category` | number string | `"3"` |
| `prefer_mobile` | boolean string | `"true"` |

### New column: `leads.website`

```sql
ALTER TABLE leads ADD COLUMN website TEXT DEFAULT NULL;
```

Populated when a scraped lead is transferred. Makes the website URL clickable in the main Leads tab.

---

## API Routes

New file: `src/routes/scraper.js`. All endpoints require auth middleware.

### Config

**`GET /api/scraper/config`**
- Returns all config keys. `api_key` value is masked as `"●●●●●"` if non-empty.
- Response: `{ config: { api_key, categories, cities, max_leads_per_run, max_per_category, prefer_mobile } }`

**`PATCH /api/scraper/config`**
- Body: any subset of config keys. Values stored as JSON strings.
- Merges into existing config (upsert per key).
- Response: `{ success: true }`
- 400 if `api_key` is set to an empty string (must either leave unchanged or provide a real key)

### Scrape execution

**`POST /api/scraper/run-chunk`**
- Body: `{ city: string, country: string, category: string }`
- Reads `api_key`, `max_per_category`, `prefer_mobile` from `scraper_config`
- Calls Google Places Text Search: `"${category} in ${city}"`
- Follows pagination up to 3 pages
- For each result (up to `max_per_category`): fetches Place Details, applies `prefer_mobile` filter, checks `place_id` against `scraped_leads` for dedup
- Inserts new records into `scraped_leads`
- Response: `{ inserted: number, skipped: number, leads: [{ id, name, city, phone, website, google_rating }] }`
- 400 if `api_key` not set
- 503 if Google Places API returns an error

### Scraped leads management

**`GET /api/scraper/leads`**
- Returns all non-transferred scraped leads (`transferred = 0`)
- Optional query params: `?status=` (filter by status), `?category=` (filter by category)
- Response: `{ leads: [...] }` ordered by `scraped_at DESC`

**`PATCH /api/scraper/leads/:id/status`**
- Body: `{ status: string }` — must be one of the five valid status values
- Response: `{ success: true }`
- 400 if invalid status value
- 404 if lead not found

**`POST /api/scraper/leads/:id/transfer`**
- Body: `{ email?: string, notes?: string }`
- Creates a record in `leads`:
  ```
  name     = scraped.name
  email    = body.email || null
  phone    = scraped.phone
  product  = scraped.category
  website  = scraped.website
  score    = 'cold'
  status   = 'new'
  notes    = "Source: Google Maps Scraper. Rating: {X}/5. City: {Y}.\n\n{body.notes}"
  created_at = now()
  ```
- Sets `scraped_leads.transferred = 1`, `transferred_lead_id = new leads.id`
- Response: `{ leadId: string }`
- 404 if scraped lead not found
- 409 if already transferred

### Registration in `src/server.js`

```javascript
const scraperRouter = require('./routes/scraper');
app.use('/api', scraperRouter);
```

---

## Scraper Service (`src/services/scraper.js`)

Node.js port of the Python scraper logic. Uses `@googlemaps/google-maps-services-js`.

### Exports

**`searchBusinesses(apiKey, city, category)`**
- Calls Places Text Search: `query = "${category} in ${city}"`
- Follows `next_page_token` pagination (2s delay between pages, up to 3 pages)
- Returns array of `{ place_id, name, rating }` (lightweight — full details fetched separately)

**`getPlaceDetails(apiKey, placeId)`**
- Fields: `name, formatted_address, formatted_phone_number, website, rating, user_ratings_total, place_id, url`
- Returns normalised object: `{ placeId, name, address, phone, website, rating, totalReviews, mapsUrl }`

**`isMobileNumber(phone)`**
- Returns true if phone matches UAE/Oman mobile pattern (05x, +9715x, 009715x)
- Returns true if phone is empty (don't skip phoneless businesses)

---

## Admin UI (`public/admin/index.html`)

New **"Scraper"** tab added to MC nav (sixth position, after Settings). No changes to existing tabs.

### Config panel (collapsible, closed by default)

- **API Key** — password input. Placeholder: "Enter Google Places API key". Shows "●●●●●" if already set. On blur: saves via `PATCH /api/scraper/config`.
- **Max leads per run** — number input, saves on blur.
- **Max per category** — number input, saves on blur.
- **Prefer mobile numbers** — checkbox, saves on change.
- **Categories** — tag list with × remove button per tag + text input with "Add" button.
- **Cities** — grouped by country. Each city is a removable tag. "Add city" input per country group.
- **"Save Config"** button — explicit save for categories and cities.

### Run panel

- **"Run Scraper"** button — on click:
  1. Fetches config from `GET /api/scraper/config`
  2. Builds chunk list: all category × city combinations, Dubai first (matches Python priority logic)
  3. Sends chunks sequentially via `POST /api/scraper/run-chunk`
  4. Stops when total `inserted` across all chunks reaches `max_leads_per_run`
  5. Shows "Stop" button during run — client-side flag, stops after current chunk completes
- **Live progress log** — `<pre>`-style scrolling log appended per chunk:
  - `"Searching salons in Dubai… +2 leads"`
  - `"Searching gym in Dubai… 0 new (3 already exist)"`
  - `"Stopped by user."`
  - `"Done — 14 new leads added across 7 searches."`
- Progress log cleared at the start of each new run.

### Scraped leads table

Loaded from `GET /api/scraper/leads` when Scraper tab is opened.

**Columns:** Business Name | Category | City | Phone | Website | Rating | Status | Actions

- **Website cell** — `<a href="..." target="_blank">` link. Shows domain only for display, full URL as href.
- **Status cell** — inline `<select>` with the five status options. On change: `PATCH /api/scraper/leads/:id/status`.
- **Filter bar** — dropdown filters for Status and Category. Filters applied client-side.
- **Actions column** — "Transfer →" button per row.

### Transfer modal

Opens on "Transfer →" click.

**Shows (read-only):** Business Name, Phone, Website (clickable), Category, City, Google Rating.

**Editable fields:**
- Email input (optional, placeholder: "Add email if known")
- Notes textarea (pre-filled: `"Source: Google Maps Scraper. Rating: X/5. City: Y."`)

**"Confirm Transfer"** button — `POST /api/scraper/leads/:id/transfer`. On success:
- Row removed from scraped leads table
- Toast notification: `"Transferred to Leads"`
- Modal closes

---

## Migration Script (`scripts/migrate-v3.js`)

Run with: `TURSO_URL=... TURSO_TOKEN=... node scripts/migrate-v3.js`

Steps:
1. `CREATE TABLE IF NOT EXISTS scraped_leads ...`
2. `CREATE INDEX IF NOT EXISTS idx_scraped_leads_status ...`
3. `CREATE INDEX IF NOT EXISTS idx_scraped_leads_place_id ...`
4. `CREATE TABLE IF NOT EXISTS scraper_config ...`
5. `ALTER TABLE leads ADD COLUMN website TEXT DEFAULT NULL` — wrapped in try/catch, skipped if already exists
6. Seed `scraper_config` with default values (INSERT OR IGNORE per key)
7. Log each step

---

## Spec Self-Review

**Placeholder scan:** No TBDs. `api_key` defaults to empty string — UI prompts to set it before first run, API returns 400 until set.

**Internal consistency:**
- `email` is nullable on transfer — consistent with the existing `leads` table where email is application-validated, not DB-constrained.
- `website` column added to `leads` in this migration (not Sub-project A) since it's only needed once scraper integration exists.
- Chunked execution loop lives entirely client-side — server stays stateless, no session tracking needed.
- `prefer_mobile` filter: if `prefer_mobile = true` and phone is a landline, the lead is skipped entirely (not deferred as in Python). Deferral logic is not replicated since chunk ordering handles variety.

**Scope check:** Self-contained. Does not touch Sub-project A (notes/statuses/charts) or Sub-project B (email agent) code paths.

**Ambiguity check:**
- "Dubai first" chunk ordering is client-side: MC sorts chunks so all Dubai combinations are sent before other cities, matching the Python scraper's priority logic.
- Transfer does not delete `scraped_leads` record — it is retained with `transferred = 1` for history. The Scraper tab only shows `transferred = 0` records.
- Pagination delay (2s between pages) runs inside the Vercel function. With up to 3 pages and `max_per_category = 3`, worst-case chunk time is ~6s — within Vercel's 10s default timeout.
