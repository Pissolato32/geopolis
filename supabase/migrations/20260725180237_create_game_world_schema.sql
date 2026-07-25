/*
# Create the GeoSim game-world schema (single-tenant, no auth)

## Purpose
Persist the entire state of a GeoSim Command game world so it survives page
reloads: countries (with live economy + military state), diplomatic
relationships, military units, the scrolling event log, and the global market
ticker state. This replaces the ephemeral in-memory simulator so a player can
close the tab and come back to the same world.

## New Tables

1. `games`
   - `id` (uuid, PK) — one per world/session
   - `name` (text) — human label, e.g. "Modern World 2026"
   - `current_tick` (int) — how many simulation turns have elapsed
   - `created_at`, `updated_at` (timestamptz)

2. `countries`
   - Flattened country state, one row per country per game.
   - `game_id` (uuid FK → games, cascade delete)
   - `code` (text, alpha-3 ISO code, e.g. "USA")
   - `numeric_code` (text, ISO 3166-1 numeric, joins to world-atlas geometry)
   - `name`, `flag` (URL), `region`, `subregion` (text)
   - `lat`, `lng` (numeric)
   - `population` (bigint)
   - Economy: `gdp` (bigint), `gdp_per_capita` (int), `treasury` (bigint),
     `tax_rate` (numeric), `stability` (int 0..100)
   - Military: `total_personnel` (int), `readiness` (int 0..100),
     `morale` (int 0..100), `force_limit` (int)
   - Composite PK (game_id, code).

3. `relationships`
   - Diplomatic stance between two countries within a game.
   - `game_id` (uuid FK), `country_code` (text), `counterpart_code` (text)
   - `affinity` (int, -100..100), `tension` (int, 0..100)
   - Composite PK (game_id, country_code, counterpart_code).

4. `units`
   - Military units stationed on the map.
   - `game_id` (uuid FK), `id` (text, e.g. "USA-1")
   - `name` (text), `owner_code` (text, alpha-3), `type` (text: infantry|armor|navy)
   - `readiness`, `morale` (int 0..100), `strength` (int)
   - `lat`, `lng` (numeric)
   - Composite PK (game_id, id).

5. `events`
   - Append-only event log, one row per game event (wars, treaties, economy, etc.)
   - `game_id` (uuid FK), `id` (uuid PK), `type` (text), `at` (timestamptz)
   - `payload` (jsonb) — the full event object for flexible querying.

6. `market_prices`
   - Current global resource prices for the ticker.
   - `game_id` (uuid FK), `resource` (text: energy|food|minerals)
   - `price` (int), `delta` (int)
   - Composite PK (game_id, resource).

## Indexes
- `idx_countries_game` on countries(game_id) for listing a world's nations.
- `idx_relationships_game` on relationships(game_id) for loading all diplomacy.
- `idx_units_game` on units(game_id) for rendering the military layer.
- `idx_events_game_at` on events(game_id, at DESC) for the scrolling feed.

## Security
- RLS enabled on ALL tables.
- This is a single-tenant app with no sign-in screen. The frontend uses the
  anon key exclusively. Therefore ALL policies use `TO anon, authenticated`
  with `USING (true)` / `WITH CHECK (true)` — the game data is intentionally
  public/shared. This is the documented single-tenant pattern, not an
  ownership-check shortcut.

## Notes
1. `games.updated_at` auto-updates via a trigger on any state change.
2. All child tables cascade-delete when a game is removed.
3. The `events` table stores raw JSONB payloads so new event types need no
   schema migration.
*/

-- ---- games ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Modern World 2026',
  current_tick integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_games" ON games;
CREATE POLICY "anon_select_games" ON games FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_games" ON games;
CREATE POLICY "anon_insert_games" ON games FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_games" ON games;
CREATE POLICY "anon_update_games" ON games FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_games" ON games;
CREATE POLICY "anon_delete_games" ON games FOR DELETE
  TO anon, authenticated USING (true);

-- ---- countries ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS countries (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  code text NOT NULL,
  numeric_code text NOT NULL DEFAULT '',
  name text NOT NULL,
  flag text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  subregion text NOT NULL DEFAULT '',
  lat numeric NOT NULL DEFAULT 0,
  lng numeric NOT NULL DEFAULT 0,
  population bigint NOT NULL DEFAULT 0,
  gdp bigint NOT NULL DEFAULT 0,
  gdp_per_capita integer NOT NULL DEFAULT 0,
  treasury bigint NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  stability integer NOT NULL DEFAULT 50,
  total_personnel integer NOT NULL DEFAULT 0,
  readiness integer NOT NULL DEFAULT 50,
  morale integer NOT NULL DEFAULT 50,
  force_limit integer NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, code)
);

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_countries" ON countries;
CREATE POLICY "anon_select_countries" ON countries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_countries" ON countries;
CREATE POLICY "anon_insert_countries" ON countries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_countries" ON countries;
CREATE POLICY "anon_update_countries" ON countries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_countries" ON countries;
CREATE POLICY "anon_delete_countries" ON countries FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_countries_game ON countries(game_id);

-- ---- relationships --------------------------------------------------------
CREATE TABLE IF NOT EXISTS relationships (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  counterpart_code text NOT NULL,
  affinity integer NOT NULL DEFAULT 0,
  tension integer NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, country_code, counterpart_code)
);

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_relationships" ON relationships;
CREATE POLICY "anon_select_relationships" ON relationships FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_relationships" ON relationships;
CREATE POLICY "anon_insert_relationships" ON relationships FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_relationships" ON relationships;
CREATE POLICY "anon_update_relationships" ON relationships FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_relationships" ON relationships;
CREATE POLICY "anon_delete_relationships" ON relationships FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_relationships_game ON relationships(game_id);

-- ---- units ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL DEFAULT '',
  owner_code text NOT NULL,
  type text NOT NULL DEFAULT 'infantry',
  readiness integer NOT NULL DEFAULT 50,
  morale integer NOT NULL DEFAULT 50,
  strength integer NOT NULL DEFAULT 0,
  lat numeric NOT NULL DEFAULT 0,
  lng numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, id)
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_units" ON units;
CREATE POLICY "anon_select_units" ON units FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_units" ON units;
CREATE POLICY "anon_insert_units" ON units FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_units" ON units;
CREATE POLICY "anon_update_units" ON units FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_units" ON units;
CREATE POLICY "anon_delete_units" ON units FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_units_game ON units(game_id);

-- ---- events ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_events" ON events;
CREATE POLICY "anon_select_events" ON events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_events" ON events;
CREATE POLICY "anon_insert_events" ON events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_events" ON events;
CREATE POLICY "anon_delete_events" ON events FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_events_game_at ON events(game_id, at DESC);

-- ---- market_prices --------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_prices (
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  resource text NOT NULL,
  price integer NOT NULL DEFAULT 100,
  delta integer NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, resource)
);

ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_market" ON market_prices;
CREATE POLICY "anon_select_market" ON market_prices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_market" ON market_prices;
CREATE POLICY "anon_insert_market" ON market_prices FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_market" ON market_prices;
CREATE POLICY "anon_update_market" ON market_prices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_market" ON market_prices;
CREATE POLICY "anon_delete_market" ON market_prices FOR DELETE
  TO anon, authenticated USING (true);

-- ---- updated_at trigger ---------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_games_touch ON games;
CREATE TRIGGER trg_games_touch
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
