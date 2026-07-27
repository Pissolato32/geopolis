/*
# Create agent_grievances table for Phase 6 — Historical Grievance & Betrayal Memory

## Purpose
Stores diplomatic grievances (broken treaties, active sanctions, unprovoked threats,
betrayals) that AI agents accumulate against other nations. These grievances drive
the Distrust Penalty (-20 to -50 affinity) when agents evaluate alliance or trade
proposals from nations with a history of betrayal.

## New Tables
- `agent_grievances`
  - `id` (uuid, primary key)
  - `country_id` (text, not null) — the nation holding the grievance
  - `perpetrator_id` (text, not null) — the nation that committed the offense
  - `grievance_type` (text, not null) — one of: broken-treaty, active-sanction, unprovoked-threat, betrayal
  - `description` (text, not null) — human-readable description of the grievance
  - `tick` (bigint, not null) — simulation tick when the grievance occurred
  - `severity` (double precision, not null, default 0.5) — 0.0 to 1.0
  - `timestamp` (bigint, not null) — Unix timestamp of recording
  - `created_at` (timestamptz, default now())

## Indexes
- `idx_agent_grievances_country` — for querying grievances by holder nation
- `idx_agent_grievances_perpetrator` — for querying grievances against a specific perpetrator
- `idx_agent_grievances_type` — for filtering by grievance type

## Security
- Enable RLS on `agent_grievances`.
- Allow anon + authenticated CRUD because the simulation engine writes/reads
  grievances as a shared, non-user-scoped data store (single-tenant simulation).
*/

CREATE TABLE IF NOT EXISTS agent_grievances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id text NOT NULL,
  perpetrator_id text NOT NULL,
  grievance_type text NOT NULL CHECK (grievance_type IN ('broken-treaty', 'active-sanction', 'unprovoked-threat', 'betrayal')),
  description text NOT NULL,
  tick bigint NOT NULL,
  severity double precision NOT NULL DEFAULT 0.5,
  timestamp bigint NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_grievances_country ON agent_grievances(country_id);
CREATE INDEX IF NOT EXISTS idx_agent_grievances_perpetrator ON agent_grievances(perpetrator_id);
CREATE INDEX IF NOT EXISTS idx_agent_grievances_type ON agent_grievances(grievance_type);

ALTER TABLE agent_grievances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_grievances" ON agent_grievances;
CREATE POLICY "anon_select_grievances" ON agent_grievances FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_grievances" ON agent_grievances;
CREATE POLICY "anon_insert_grievances" ON agent_grievances FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_grievances" ON agent_grievances;
CREATE POLICY "anon_update_grievances" ON agent_grievances FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_grievances" ON agent_grievances;
CREATE POLICY "anon_delete_grievances" ON agent_grievances FOR DELETE
TO anon, authenticated USING (true);
