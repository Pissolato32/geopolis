/*
# Create covert_operations and international_blocs tables

1. New Tables
- `covert_operations`
  - `id` (uuid, primary key)
  - `op_id` (text, unique) — application-generated operation ID
  - `source_country` (text, not null) — alpha-3 code of the initiating country
  - `target_country` (text, not null) — alpha-3 code of the target country
  - `type` (text, not null) — cyber_sabotage | political_subversion | economic_sabotage | troop_recon
  - `success_chance` (numeric) — 0.30 to 0.85
  - `exposure_risk` (numeric) — 0.15 to 0.60
  - `cost_treasury` (numeric) — treasury cost
  - `start_tick` (integer) — tick operation was launched
  - `end_tick` (integer) — tick operation completes
  - `status` (text) — planning | active | succeeded | failed | exposed | aborted
  - `created_at` (timestamptz)

- `international_blocs`
  - `id` (uuid, primary key)
  - `bloc_id` (text, unique) — application-generated bloc ID
  - `name` (text, not null) — bloc display name (e.g., "NATO", "BRICS")
  - `type` (text, not null) — economic | military
  - `members` (jsonb, not null) — array of alpha-3 country codes
  - `collective_defense` (boolean, default false) — Article 5 trigger
  - `tariff_reduction_pct` (numeric, default 0)
  - `trade_bonus_pct` (numeric, default 0)
  - `founded_tick` (integer)
  - `created_at` (timestamptz)

2. Purpose
- `covert_operations` persists active and completed stealth missions, including
  exposed espionage incidents for diplomatic consequences.
- `international_blocs` persists multilateral coalition memberships, enabling
  collective defense triggers and economic trade bonuses across save/load cycles.

3. Security
- Single-tenant simulation game with no sign-in screen.
- RLS enabled with anon+authenticated full CRUD (data is intentionally shared).
*/

CREATE TABLE IF NOT EXISTS covert_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  op_id text UNIQUE NOT NULL,
  source_country text NOT NULL,
  target_country text NOT NULL,
  type text NOT NULL CHECK (type IN ('cyber_sabotage', 'political_subversion', 'economic_sabotage', 'troop_recon')),
  success_chance numeric NOT NULL DEFAULT 0.5,
  exposure_risk numeric NOT NULL DEFAULT 0.3,
  cost_treasury numeric NOT NULL DEFAULT 0,
  start_tick integer NOT NULL DEFAULT 0,
  end_tick integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'succeeded', 'failed', 'exposed', 'aborted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE covert_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_covert_ops" ON covert_operations;
CREATE POLICY "anon_select_covert_ops" ON covert_operations FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_covert_ops" ON covert_operations;
CREATE POLICY "anon_insert_covert_ops" ON covert_operations FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_covert_ops" ON covert_operations;
CREATE POLICY "anon_update_covert_ops" ON covert_operations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_covert_ops" ON covert_operations;
CREATE POLICY "anon_delete_covert_ops" ON covert_operations FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_covert_ops_source ON covert_operations(source_country);
CREATE INDEX IF NOT EXISTS idx_covert_ops_status ON covert_operations(status);

CREATE TABLE IF NOT EXISTS international_blocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloc_id text UNIQUE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('economic', 'military')),
  members jsonb NOT NULL DEFAULT '[]',
  collective_defense boolean NOT NULL DEFAULT false,
  tariff_reduction_pct numeric NOT NULL DEFAULT 0,
  trade_bonus_pct numeric NOT NULL DEFAULT 0,
  founded_tick integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE international_blocs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_blocs" ON international_blocs;
CREATE POLICY "anon_select_blocs" ON international_blocs FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_blocs" ON international_blocs;
CREATE POLICY "anon_insert_blocs" ON international_blocs FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_blocs" ON international_blocs;
CREATE POLICY "anon_update_blocs" ON international_blocs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_blocs" ON international_blocs;
CREATE POLICY "anon_delete_blocs" ON international_blocs FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_blocs_type ON international_blocs(type);
