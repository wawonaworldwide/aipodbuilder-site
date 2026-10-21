-- Add store tables without replacing existing local subscriber data.
CREATE TABLE IF NOT EXISTS checkout_sessions (id TEXT PRIMARY KEY, slug TEXT NOT NULL, env TEXT NOT NULL CHECK(env='test'), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, stripe_session_id TEXT UNIQUE NOT NULL, stripe_payment_intent TEXT, slug TEXT NOT NULL, product_name TEXT NOT NULL, version TEXT NOT NULL, r2_key TEXT NOT NULL, email TEXT NOT NULL, amount_total INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','paid','fulfilled','refunded','failed','disputed')), paid_at INTEGER, fulfilled_at INTEGER, email_sent_at INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS order_payment ON orders(stripe_payment_intent);
CREATE INDEX IF NOT EXISTS order_email ON orders(email,created_at);
CREATE TABLE IF NOT EXISTS download_tokens (token_hash TEXT PRIMARY KEY, seed TEXT NOT NULL, order_id TEXT NOT NULL REFERENCES orders(id), expires_at INTEGER NOT NULL, max_uses INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS token_order ON download_tokens(order_id,created_at);
CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL, received_at INTEGER NOT NULL, processed_at INTEGER, lease_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payment_holds (payment_intent TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('refunded','disputed')), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mail_jobs (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), token_hash TEXT NOT NULL REFERENCES download_tokens(token_hash), created_at INTEGER NOT NULL, sent_at INTEGER, lease_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS delivery_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS store_rate_events (id TEXT PRIMARY KEY, rate_key TEXT NOT NULL, requested_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS store_rate_lookup ON store_rate_events(rate_key,requested_at);
CREATE TABLE IF NOT EXISTS owner_consents (order_id TEXT PRIMARY KEY REFERENCES orders(id), created_at INTEGER NOT NULL, applied_at INTEGER);
