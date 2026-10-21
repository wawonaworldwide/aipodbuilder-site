-- Phase 4 signup data. Payment tables arrive in a later migration.
CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, first_name TEXT, source TEXT NOT NULL, tags TEXT NOT NULL CHECK (json_valid(tags)), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS signup_rate_events (id TEXT PRIMARY KEY, rate_key TEXT NOT NULL, requested_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS signup_rate_lookup ON signup_rate_events(rate_key, requested_at);
CREATE TABLE IF NOT EXISTS email_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK (json_valid(payload)), created_at TEXT NOT NULL);
