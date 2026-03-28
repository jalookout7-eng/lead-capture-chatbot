CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  product         TEXT NOT NULL,
  phone           TEXT,
  notes           TEXT,
  summary         TEXT,
  bottlenecks     TEXT,
  score           TEXT DEFAULT 'cold',
  followup        TEXT,
  followup_sent   INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'new',
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id          TEXT PRIMARY KEY,
  lead_id     TEXT REFERENCES leads(id),
  messages    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_lead_id ON chat_sessions(lead_id);
