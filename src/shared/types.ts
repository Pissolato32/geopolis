// Shared domain types used by the seeder, the game server, and the dashboard.

export interface CountryEconomy {
  gdp: number; // total GDP in USD
  gdpPerCapita: number; // USD per person
  treasury: number; // current treasury in USD
  taxRate: number; // 0..1
  stability: number; // 0..100
  legislativeSupport: number; // 0..1 (democracies only)
}

export interface CountryMilitary {
  totalPersonnel: number; // active personnel
  readiness: number; // 0..100
  morale: number; // 0..100
  forceLimit: number; // max deployable troops
  militaryLoyalty: number; // 0..100 (faction loyalty to regime)
}



export interface Relationship {
  countryCode: string; // alpha-3 code of the counterpart
  affinity: number; // -100 (hostile) .. +100 (allied)
  tension: number; // 0..100
}

/** Government regime type — determines cabinet flavor text, not advisor availability. */
export type RegimeType = "democracy" | "autocracy" | "dictatorship" | "monarchy" | "technocracy";

/** The 5 universal advisor slots present in every regime type. */
export type AdvisorSlotId =
  | "finance"      // Financial & Economic Advisor
  | "treasury"     // Treasury & Fiscal Advisor
  | "defense"      // Defense & National Security Advisor
  | "foreign"      // Foreign Affairs Advisor
  | "stability";   // Internal Stability & Social Advisor

/** Ideological profile for advisor candidates. */
export type AdvisorIdeology =
  | "keynesian-growth"
  | "fiscal-conservative"
  | "hawkish"
  | "social-democrat"
  | "pragmatist"
  | "isolationist";

/** A sitting advisor or null for a vacant post. */
export interface AdvisorState {
  slotId: AdvisorSlotId;
  name: string;
  ideology: AdvisorIdeology;
  satisfaction: number;   // 0..100
  loyalty: number;        // 0..100
  appointedTick: number;
}

/** A candidate for appointment presented in the dismiss/appoint modal. */
export interface AdvisorCandidate {
  id: string;
  name: string;
  ideology: AdvisorIdeology;
  bio: string;
  satisfactionPrediction: number;  // predicted starting satisfaction
  loyaltyPrediction: number;       // predicted starting loyalty
}

/** Full cabinet state for a nation — 5 slots, each nullable. */
export type CabinetState = Record<AdvisorSlotId, AdvisorState | null>;

/** An active treaty between two nations, tracked in world state. */
export interface ActiveTreaty {
  id: string;
  parties: [string, string];   // alpha-3 codes
  kind: "non-aggression" | "trade" | "alliance";
  signedTick: number;
  durationYears: number;
}

/** Policy cooldown tracking — suppresses repetitive cards after execution. */
export interface PolicyCooldown {
  policyType: string;   // e.g. "set-tax", "set-readiness"
  expiresAtTick: number;
}

/** A single competing option on a multi-advisor decision card. */
export interface CompetingOption {
  id: string;
  slotId: AdvisorSlotId;
  advisorName: string;
  ideology: AdvisorIdeology;
  objective: string;         // the advisor's primary goal
  targetKpi: string;         // which KPI this targets
  label: string;             // e.g. "Set tax to 22%"
  effects: CardOptionEffects;
  satisfactionDelta: number; // predicted satisfaction change if chosen
}

/** A decision card with competing advisor proposals. */
export interface CompetingCard {
  id: string;
  title: string;
  description: string;
  category: CabinetCard["category"];
  kpiTrigger: string;        // what KPI issue triggered this card
  options: CompetingOption[];
  tickCreated: number;
}

/** The 3 research branches in the technology tree. */
export type TechBranch = "economy" | "defense" | "governance_intel";

/** KPI modifiers applied when a tech node is unlocked. */
export interface TechKpiModifiers {
  gdpGrowthDelta?: number;       // e.g. +0.02 (2% GDP growth boost)
  taxYieldBonus?: number;        // e.g. +0.015 (1.5% extra tax revenue)
  readinessMaxBonus?: number;    // e.g. +5 (raises readiness cap by 5)
  stabilityDelta?: number;       // e.g. +0.03 (3% stability boost)
  intelFidelityBonus?: number;   // e.g. +0.10 (10% intel accuracy boost)
}

/** A single technology node in the research tree. */
export interface ITechNode {
  id: string;
  name: string;
  branch: TechBranch;
  tier: 1 | 2 | 3;
  costPoints: number;          // research points required to unlock
  prerequisites: string[];     // tech IDs that must be unlocked first
  description: string;
  kpiModifiers: TechKpiModifiers;
}

/** Progress state for a single tech node being researched. */
export interface TechProgress {
  techId: string;
  accumulatedPoints: number;   // 0..costPoints
  unlocked: boolean;           // true when fully researched
  unlockedTick?: number;       // tick when research completed
}

/** Full research state for a nation — all 3 branches. */
export interface ResearchState {
  countryId: string;
  progress: Record<string, TechProgress>;  // keyed by techId
  totalUnlocked: number;
  researchPerTick: number;     // base research output per tick
}

// ===== Covert Operations Types =====

export type CovertOpType = "cyber_sabotage" | "political_subversion" | "economic_sabotage" | "troop_recon";

export type CovertOpStatus = "planning" | "active" | "succeeded" | "failed" | "exposed" | "aborted";

export interface CovertOperation {
  id: string;
  type: CovertOpType;
  sourceCountry: string;
  targetCountry: string;
  successChance: number;     // 0.30 - 0.85
  exposureRisk: number;      // 0.15 - 0.60
  costTreasury: number;
  durationTicks: number;
  startTick: number;
  endTick: number;
  status: CovertOpStatus;
  researchDelayTicks?: number;  // for cyber_sabotage
}

export interface CovertOpsState {
  countryId: string;
  activeOps: CovertOperation[];
  completedOps: CovertOperation[];
  exposedIncidents: CovertOperation[];
}

// ===== Multilateral Blocs Types =====

export type BlocType = "economic" | "military";

export interface InternationalBloc {
  id: string;
  name: string;
  type: BlocType;
  members: string[];         // country alpha-3 codes
  foundedTick: number;
  collectiveDefense: boolean; // true for military blocs with Article 5
  tariffReductionPct: number; // for economic blocs
  tradeBonusPct: number;      // bilateral trade bonus for members
}

export interface BlocMembership {
  blocId: string;
  countryId: string;
  joinedTick: number;
}

// ===== Victory Conditions Types =====

export type VictoryType = "hegemonic" | "tech_supremacy" | "pax" | "survival";

export interface VictoryProgress {
  hegemonic: {
    gdpControlPct: number;       // % of global GDP controlled
    militaryControlPct: number;  // % of global military power
    overallPct: number;          // max of the two
  };
  techSupremacy: {
    tier3Unlocked: number;       // count of T3 techs unlocked (max 3)
    overallPct: number;
  };
  pax: {
    consecutiveLowTensionTicks: number;  // ticks with tension < 15%
    requiredTicks: number;                // 100
    hasActiveAlliances: boolean;
    overallPct: number;
  };
  survival: {
    scenarioTicksElapsed: number;
    scenarioTicksRequired: number;
    governmentIntact: boolean;
    capitalHeld: boolean;
    overallPct: number;
  };
  achieved: VictoryType | null;
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
  regimeType?: RegimeType;
  cabinet?: CabinetState;
  activeTreaties?: ActiveTreaty[];
  cooldowns?: PolicyCooldown[];
  research?: ResearchState;
  covertOps?: CovertOpsState;
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
  | { type: "sabotage.failed"; at: string; from: string; target: string; cost: number; reason: string }
  | { type: "narrative.beat"; at: string; tick: number; severity: "routine" | "notable" | "dramatic" | "critical"; minister?: "defense" | "foreign" | "economy" | "intelligence"; prose: string };

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
  cabinetCards?: CabinetCard[];
}

export interface CardOptionEffects {
  treasuryDelta?: number;
  stabilityDelta?: number;
  readinessDelta?: number;
  tensionDelta?: number;
  militaryLoyaltyDelta?: number;
  legislativeSupportDelta?: number;
}

export interface CardOption {
  id: string;
  label: string;
  effects: CardOptionEffects;
}

export interface CabinetCard {
  id: string;
  title: string;
  description: string;
  category: "Economy" | "Defense" | "Diplomacy" | "Internal Politics";
  options: CardOption[];
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
  | { intent: "recruit-unit"; from: string; unitType: UnitType; cost: number }
  | { intent: "adjust-tariffs"; from: string; target: string; rate: number }
  | { intent: "impose-sanction"; from: string; target: string; kind: "economic" | "military" | "diplomatic" }
  | { intent: "conduct-recon"; from: string; target: string; cost: number }
  | { intent: "resolve-cabinet-card"; from: string; cardId: string; optionId?: string; delegated: boolean };

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
