// Shared domain types used by the seeder, the game server, and the dashboard.

export interface CountryEconomy {
  gdp: number; // total GDP in USD
  gdpPerCapita: number; // USD per person
  treasury: number; // current treasury in USD
  taxRate: number; // 0..1
  stability: number; // 0..100
}

export interface CountryMilitary {
  totalPersonnel: number; // active personnel
  readiness: number; // 0..100
  morale: number; // 0..100
  forceLimit: number; // max deployable troops
}

export interface Relationship {
  countryCode: string; // alpha-3 code of the counterpart
  affinity: number; // -100 (hostile) .. +100 (allied)
  tension: number; // 0..100
}

export interface Country {
  id: string; // alpha-3 code
  numericCode: string; // ISO 3166-1 numeric (joins to world-atlas geometry id)
  name: string;
  flag: string; // flag URL
  latlng: [number, number];
  region: string;
  subregion: string;
  population: number;
  economy: CountryEconomy;
  military: CountryMilitary;
  relationships: Relationship[];
}

export interface WorldSeed {
  generatedAt: string; // ISO timestamp
  source: string;
  countryCount: number;
  countries: Country[];
}

export type UnitType = "infantry" | "armor" | "navy";

export interface Unit {
  id: string;
  name: string;
  ownerCode: string;
  type: UnitType;
  readiness: number;
  morale: number;
  latlng: [number, number];
  strength: number;
}

// Active Conflict / War Zone rendered as a single war icon on the canvas.
export interface ActiveConflict {
  id: string;
  title: string;
  attackerCode: string;
  defenderCode: string;
  locationName: string;
  latlng: [number, number];
  startedAt: string;
  intensity: "high" | "medium" | "low";
  attackerLosses: number;
  defenderLosses: number;
  attEstimatedStrength: number;
  defEstimatedStrength: number;
}

export interface MarketPrice {
  resource: "energy" | "food" | "minerals";
  price: number;
  delta: number;
}

export type GameEvent =
  | { type: "war.combat-resolved"; at: string; attacker: string; defender: string; attackerLosses: number; defenderLosses: number; victor: string }
  | { type: "war.unit-destroyed"; at: string; unitId: string; ownerCode: string; by: string }
  | { type: "diplomacy.treaty-signed"; at: string; parties: string[]; kind: "non-aggression" | "trade" | "alliance"; durationYears: number }
  | { type: "economy.indicator"; at: string; country: string; gdp: number; treasury: number; delta: number }
  | { type: "economy.market-update"; at: string; prices: MarketPrice[] }
  | { type: "turn.advanced"; at: string; tick: number; gdpDeltaTotal: number; activeConflictsCount: number; treatiesSignedCount: number }
  | { type: "turn.tension-shift"; at: string; countryA: string; countryB: string; newTension: number; reason: string }
  | { type: "turn.economy-growth"; at: string; country: string; gdp: number; growthPct: number }
  | { type: "turn.stability-shift"; at: string; country: string; newStability: number; delta: number }
  | { type: "ai.decision"; at: string; country: string; action: string; rationale: string }
  | { type: "war.declared"; at: string; aggressor: string; target: string; reason: string }
  | { type: "peace.declared"; at: string; initiator: string; target: string; terms: string };

export type StrictIntent =
  | { intent: "declare-war"; from: string; target: string }
  | { intent: "propose-trade"; from: string; target: string; terms?: string }
  | { intent: "improve-relations"; from: string; target: string }
  | { intent: "move-unit"; unitId: string; from: string; to: [number, number] }
  | { intent: "disband-unit"; unitId: string; from: string };

export type IntentResponse =
  | { ok: true; acknowledged: StrictIntent; events: GameEvent[] }
  | { ok: false; error: string };
