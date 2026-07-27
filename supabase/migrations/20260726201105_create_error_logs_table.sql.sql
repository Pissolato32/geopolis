/*
# Create error_logs table for application error tracking

1. New Tables
- `error_logs`
  - `id` (bigint, primary key, auto-increment)
  - `category` (text, not null) — error category: network, api, validation, persistence, websocket, render, offline
  - `severity` (text, not null) — info, warning, error, critical
  - `source` (text, not null) — where the error originated (e.g. "gameStore.seedWorld")
  - `message` (text, not null) — the raw error message
  - `user_message` (text) — user-friendly message shown in the UI
  - `metadata` (jsonb) — additional structured context
  - `timestamp` (timestamptz, not null) — when the error occurred
  - `user_agent` (text) — browser user agent for debugging
  - `created_at` (timestamptz, default now()) — when the log row was inserted

2. Indexes
- `idx_error_logs_timestamp` — descending timestamp for recent-error queries
- `idx_error_logs_category` — filter by category for trend analysis
- `idx_error_logs_severity` — filter by severity for alerting

3. Security
- Enable RLS on `error_logs`.
- Allow anon + authenticated to INSERT (the browser-side client needs to log errors).
- Allow authenticated to SELECT/UPDATE/DELETE for admin dashboards.
- No SELECT for anon — error logs should not be publicly readable.
*/

CREATE TABLE IF NOT EXISTS error_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category text NOT NULL,
  severity text NOT NULL,
  source text NOT NULL,
  message text NOT NULL,
  user_message text,
  metadata jsonb,
  timestamp timestamptz NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_error_logs" ON error_logs;
CREATE POLICY "anon_insert_error_logs"
ON error_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select_error_logs" ON error_logs;
CREATE POLICY "auth_select_error_logs"
ON error_logs FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "auth_update_error_logs" ON error_logs;
CREATE POLICY "auth_update_error_logs"
ON error_logs FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_error_logs" ON error_logs;
CREATE POLICY "auth_delete_error_logs"
ON error_logs FOR DELETE
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs (category);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs (severity);
