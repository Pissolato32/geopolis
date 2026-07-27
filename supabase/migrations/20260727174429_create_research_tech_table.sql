/*
# Create research_tech table for R&D system persistence

1. New Tables
- `research_tech`
  - `id` (uuid, primary key)
  - `country_id` (text, not null) — alpha-3 country code (e.g. "USA")
  - `tech_id` (text, not null) — technology node ID from the tech tree
  - `branch` (text, not null) — economy | defense | governance_intel
  - `tier` (integer, not null) — 1, 2, or 3
  - `accumulated_points` (numeric, default 0) — research points accumulated so far
  - `unlocked` (boolean, default false) — whether the tech is fully researched
  - `unlocked_tick` (integer, nullable) — tick when research completed
  - `updated_at` (timestamptz, default now())

  Unique constraint on (country_id, tech_id) to prevent duplicate rows.

2. Purpose
- Stores per-country research progress across all 9 tech nodes (3 branches × 3 tiers).
- Enables save/load persistence: the game can serialize the full research state
  to this table and restore it on reload.

3. Security
- This is a single-tenant simulation game with no sign-in screen.
- RLS enabled with anon+authenticated full CRUD access (data is intentionally shared).
*/

CREATE TABLE IF NOT EXISTS research_tech (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id text NOT NULL,
  tech_id text NOT NULL,
  branch text NOT NULL CHECK (branch IN ('economy', 'defense', 'governance_intel')),
  tier integer NOT NULL CHECK (tier IN (1, 2, 3)),
  accumulated_points numeric NOT NULL DEFAULT 0,
  unlocked boolean NOT NULL DEFAULT false,
  unlocked_tick integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country_id, tech_id)
);

ALTER TABLE research_tech ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_research_tech" ON research_tech;
CREATE POLICY "anon_select_research_tech" ON research_tech FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_research_tech" ON research_tech;
CREATE POLICY "anon_insert_research_tech" ON research_tech FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_research_tech" ON research_tech;
CREATE POLICY "anon_update_research_tech" ON research_tech FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_research_tech" ON research_tech;
CREATE POLICY "anon_delete_research_tech" ON research_tech FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_research_tech_country ON research_tech(country_id);
CREATE INDEX IF NOT EXISTS idx_research_tech_unlocked ON research_tech(country_id, unlocked);
