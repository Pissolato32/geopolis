/*
# Create Agent Memory Tables (single-tenant, no auth)

1. New Tables
- `agent_decisions` — Records each decision an AI agent makes per tick.
  - `id` (uuid, primary key)
  - `country_id` (text, not null) — the entity ID of the country (e.g. "country-us")
  - `tick` (bigint, not null) — simulation tick number when the decision was made
  - `action_type` (text, not null) — the type of action taken (e.g. "economy.invest")
  - `narrative_summary` (text, not null) — human-readable description of the decision
  - `timestamp` (bigint, not null) — epoch milliseconds when the decision was recorded
- `agent_episodes` — Compressed narrative summaries of a span of agent decisions.
  - `id` (uuid, primary key)
  - `country_id` (text, not null) — which country's agent the episode belongs to
  - `episode_id` (text, not null) — unique identifier for the episode
  - `summary` (text, not null) — narrative summary of the episode
  - `start_tick` (bigint, not null) — first tick covered by the episode
  - `end_tick` (bigint, not null) — last tick covered by the episode
  - `created_at` (bigint, not null) — epoch milliseconds when the episode was created
2. Indexes
- `idx_agent_decisions_country_tick` on `agent_decisions(country_id, tick DESC)` — fast recent-decision lookups
- `idx_agent_episodes_country_endtick` on `agent_episodes(country_id, end_tick DESC)` — fast episode queries
3. Security
- Enable RLS on both tables.
- Allow anon + authenticated CRUD because this is a single-tenant simulation engine with no sign-in screen. The data is intentionally shared/public.
4. Important Notes
- These tables persist agent memory across server restarts, enabling AI agents to recall past decisions.
- Decisions are queried by the AgentMemory system to build context for future decisions.
- Episodes are compressed summaries created by the summarization system (future milestone).
*/

CREATE TABLE IF NOT EXISTS agent_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id text NOT NULL,
  tick bigint NOT NULL,
  action_type text NOT NULL,
  narrative_summary text NOT NULL,
  timestamp bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_country_tick
  ON agent_decisions (country_id, tick DESC);

ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_agent_decisions" ON agent_decisions;
CREATE POLICY "anon_select_agent_decisions" ON agent_decisions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_agent_decisions" ON agent_decisions;
CREATE POLICY "anon_insert_agent_decisions" ON agent_decisions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_agent_decisions" ON agent_decisions;
CREATE POLICY "anon_update_agent_decisions" ON agent_decisions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_agent_decisions" ON agent_decisions;
CREATE POLICY "anon_delete_agent_decisions" ON agent_decisions FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS agent_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id text NOT NULL,
  episode_id text NOT NULL,
  summary text NOT NULL,
  start_tick bigint NOT NULL,
  end_tick bigint NOT NULL,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_episodes_country_endtick
  ON agent_episodes (country_id, end_tick DESC);

ALTER TABLE agent_episodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_agent_episodes" ON agent_episodes;
CREATE POLICY "anon_select_agent_episodes" ON agent_episodes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_agent_episodes" ON agent_episodes;
CREATE POLICY "anon_insert_agent_episodes" ON agent_episodes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_agent_episodes" ON agent_episodes;
CREATE POLICY "anon_update_agent_episodes" ON agent_episodes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_agent_episodes" ON agent_episodes;
CREATE POLICY "anon_delete_agent_episodes" ON agent_episodes FOR DELETE
  TO anon, authenticated USING (true);
