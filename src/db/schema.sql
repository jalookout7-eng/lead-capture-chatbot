CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  product         TEXT NOT NULL,
  summary         TEXT,
  bottlenecks     TEXT,
  score           TEXT DEFAULT 'cold',
  followup        TEXT,
  followup_sent   INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'new',
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT REFERENCES leads(id),
  messages    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
