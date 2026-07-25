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
  posture: DiplomaticPosture;
  relationships: Relationship[];
}

/** Player's espionage knowledge about a foreign nation (0 = blind, 100 = full). */
export type IntelLevel = number; // 0..100

export interface WorldSeed {
  generatedAt: string; // ISO timestamp
  source: string;
  countryCount: number;
  countries: Country[];
}

// Military unit stationed on the map. Rendered as a marker on the canvas.
export type UnitType = "infantry" | "armor" | "navy";

export interface Unit {
  id: string; // stable id, e.g. "USA-1"
  name: string; // human label, e.g. "3rd Infantry"
  ownerCode: string; // alpha-3 owner country
  type: UnitType;
  readiness: number; // 0..100
  morale: number; // 0..100
  latlng: [number, number];
  strength: number; // current personnel
}

// Global resource price for the market ticker.
export interface MarketPrice {
  resource: "energy" | "food" | "minerals";
  price: number; // index value, USD/unit
  delta: number; // change since last tick (positive = up)
}

// Event bus payloads streamed over the WebSocket.

export type GameEvent =
  | { type: "war.combat-resolved"; at: string; attacker: string; defender: string; attackerLosses: number; defenderLosses: number; victor: string }
  | { type: "war.unit-destroyed"; at: string; unitId: string; ownerCode: string; by: string }
  | { type: "diplomacy.treaty-signed"; at: string; parties: string[]; kind: "non-aggression" | "trade" | "alliance"; durationYears: number }
  | { type: "economy.indicator"; at: string; country: string; gdp: number; treasury: number; delta: number }
  | { type: "economy.market-update"; at: string; prices: MarketPrice[] }
  | { type: "turn.advanced"; at: string; tick: number; summary: TurnSummary }
  | { type: "turn.tension-shift"; at: string; tick: number; countryA: string; countryB: string; delta: number; reason: string }
  | { type: "turn.economy-growth"; at: string; tick: number; country: string; gdpGrowth: number; treasuryChange: number }
  | { type: "turn.stability-shift"; at: string; tick: number; country: string; stability: number; delta: number }
  | { type: "war.declared"; at: string; tick: number; aggressor: string; target: string; reason: string }
  | { type: "peace.declared"; at: string; tick: number; initiator: string; target: string; terms: string }
  | { type: "ai.decision"; at: string; tick: number; country: string; action: string; rationale: string }
  | { type: "policy.tax-set"; at: string; country: string; rate: number; treasuryImpact: number }
  | { type: "policy.readiness-set"; at: string; country: string; level: number; moraleImpact: number }
  | { type: "policy.posture-set"; at: string; country: string; posture: DiplomaticPosture }
  | { type: "military.recruitment"; at: string; country: string; unitType: UnitType; unitId: string; cost: number }
  | { type: "intel.gathered"; at: string; player: string; target: string; intelLevel: number; cost: number }
  | { type: "aid.sent"; at: string; from: string; target: string; amount: number; affinityGain: number }
  | { type: "sabotage.executed"; at: string; from: string; target: string; stabilityHit: number; readinessHit: number; cost: number }
  | { type: "sabotage.failed"; at: string; from: string; target: string; cost: number; reason: string };

// Aggregate result of one simulation turn, emitted with turn.advanced.
export interface TurnSummary {
  tick: number;
  countriesProcessed: number;
  tensionsResolved: number;
  economiesGrown: number;
  economiesShrunk: number;
  combats: number;
  treaties: number;
  globalGdpDelta: number;
  aiDecisions: number;
}

export type DiplomaticPosture = "isolationist" | "diplomatic" | "assertive" | "expansionist";

export interface PlayerPolicy {
  taxRate: number; // 0..1
  readiness: number; // 0..100
  posture: DiplomaticPosture;
}

// Strict intent parser payload — the JSON shape action buttons must emit.
export type StrictIntent =
  | { intent: "declare-war"; from: string; target: string }
  | { intent: "propose-trade"; from: string; target: string; terms?: string }
  | { intent: "improve-relations"; from: string; target: string }
  | { intent: "move-unit"; unitId: string; from: string; to: [number, number] }
  | { intent: "disband-unit"; unitId: string; from: string }
  | { intent: "set-tax"; from: string; rate: number }
  | { intent: "set-readiness"; from: string; level: number }
  | { intent: "set-posture"; from: string; posture: DiplomaticPosture }
  | { intent: "send-aid"; from: string; target: string; amount: number }
  | { intent: "gather-intel"; from: string; target: string; cost: number }
  | { intent: "fund-sabotage"; from: string; target: string; cost: number }
  | { intent: "recruit-unit"; from: string; unitType: UnitType; cost: number };

export type IntentResponse =
  | { ok: true; acknowledged: StrictIntent; events: GameEvent[] }
  | { ok: false; error: string };

/** A geographic cluster of military units, rendered as a single fog-of-war marker. */
export interface ConflictZone {
  id: string;
  centroid: [number, number];
  unitCount: number;
  ownerCodes: string[];
  /** Dominant unit type in the cluster, for intel-gated display. */
  dominantType: UnitType;
  /** 0 = friendly/neutral presence, 100 = active hostilities. */
  hostility: number;
  /** Units belonging to the cluster (hidden unless intel is high). */
  units: Unit[];
}
