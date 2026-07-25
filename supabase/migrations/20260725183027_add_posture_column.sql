-- Add diplomatic posture column to countries.
-- Allows players (and AI) to set a strategic posture that affects the simulation.
ALTER TABLE countries
  ADD COLUMN IF NOT EXISTS posture text NOT NULL DEFAULT 'diplomatic'
  CHECK (posture IN ('isolationist', 'diplomatic', 'assertive', 'expansionist'));