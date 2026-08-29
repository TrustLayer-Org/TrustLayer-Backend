-- Trust Signals Database Schema
-- Version 1: Initial schema for durable signal storage

CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL,
  signal_type TEXT NOT NULL CHECK(signal_type IN ('payment', 'review', 'dispute', 'kyc')),
  value REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signals_business_id ON signals(business_id);
CREATE INDEX IF NOT EXISTS idx_signals_signal_type ON signals(signal_type);

-- Schema version tracking for migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Initialize schema version
INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
