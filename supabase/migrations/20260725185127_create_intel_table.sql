-- Track the player's espionage knowledge of foreign nations.
-- Each row is the player's intel level (0-100) for one country.
CREATE TABLE IF NOT EXISTS intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_code text NOT NULL DEFAULT 'USA',
  target_code text NOT NULL,
  intel_level int NOT NULL DEFAULT 0 CHECK (intel_level >= 0 AND intel_level <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_code, target_code)
);

ALTER TABLE intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_intel" ON intel FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_intel" ON intel FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_intel" ON intel FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_intel" ON intel FOR DELETE
  TO anon, authenticated USING (true);