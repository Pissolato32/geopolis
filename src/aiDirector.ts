// aiDirector — the AI brain for non-player nations. Each turn, a subset of
// nations evaluates its geopolitical situation and may take autonomous
// actions through the 5-level escalation ladder. War declarations require
// tension 95+, accumulated casus belli, geographic contiguity or naval
// projection, and cannot occur before tick 6.

import type { Country, GameEvent, Relationship } from "./shared/types.js";
import {
  canDeclareWar,
  classifyEscalation,
  accumulateCasusBelli,
  EscalationLevel,
  MIN_TICK_BEFORE_WAR,
  type IEscalationContext,
} from "./engine/domain/war/escalation-ladder.js";

export { EscalationLevel, MIN_TICK_BEFORE_WAR };

export const PLAYER_CODE = "USA";

const at = () => new Date().toISOString();

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const WAR_REASONS = [
  "territorial dispute",
  "resource conflict",
  "provocation at the border",
  "alliance obligations",
  "strategic objectives",
];

const PEACE_TERMS = [
  "status quo ante",
  "mutual demilitarization",
  "trade normalization",
  "prisoner exchange",
];

const DIPLO_RATIONALES = [
  "seeking new trade partners",
  "diplomatic outreach program",
  "responding to overtures",
  "economic necessity",
  "regional stability initiative",
];

const FRICTION_RATIONALES = [
  "trade dispute escalation",
  "tariff retaliation",
  "verbal warning issued",
  "ambassador recalled for consultations",
];

const BORDER_TENSION_RATIONALES = [
  "covert operations detected",
  "troop posturing along border",
  "intelligence gathering intensified",
  "sanctions regime imposed",
];

const CRISIS_RATIONALES = [
  "military mobilization ordered",
  "border skirmishes reported",
  "formal ultimatum issued",
];

/** Per-nation-pair casus belli tracking. Keyed by `${aggressor}-${target}`. */
const casusBelliMap = new Map<string, number>();
/** Per-nation-pair ultimatum tick. Keyed by `${aggressor}-${target}`. */
const ultimatumMap = new Map<string, number>();

function casusBelliKey(a: string, b: string): string {
  return `${a}-${b}`;
}

function getCasusBelli(a: string, b: string): number {
  return casusBelliMap.get(casusBelliKey(a, b)) ?? 0;
}

function getUltimatumTick(a: string, b: string): number | null {
  return ultimatumMap.get(casusBelliKey(a, b)) ?? null;
}

/** Check whether two countries share a geographic border (same region or subregion). */
function hasSharedBorder(a: Country, b: Country): boolean {
  return a.region === b.region || a.subregion === b.subregion;
}

/** Check whether a country has naval projection capability (high readiness + force limit). */
function hasNavalProjection(c: Country): boolean {
  return c.military.readiness >= 70 && c.military.forceLimit >= 50000;
}

/** Compute a nation's overall "power score" — used for AI self-assessment. */
function powerScore(c: Country): number {
  const milScore = c.military.readiness * c.military.morale * c.military.totalPersonnel;
  const ecoScore = c.economy.gdp * (c.economy.stability / 100);
  return milScore * 0.0001 + ecoScore * 0.0000001;
}

/** Find the single most hostile relationship for a nation. */
function worstEnemy(c: Country): Relationship | null {
  if (c.relationships.length === 0) return null;
  return c.relationships.reduce((worst, r) => (r.tension > worst.tension ? r : worst));
}

/** Find the most friendly relationship for a nation. */
function bestFriend(c: Country): Relationship | null {
  if (c.relationships.length === 0) return null;
  return c.relationships.reduce((best, r) => (r.affinity > best.affinity ? r : best));
}

/** The result of one AI evaluation pass. */
export interface AIDecision {
  events: GameEvent[];
  /** Patches to apply to the acting nation's relationships (by counterpart code). */
  relPatches: Map<string, { tension?: number; affinity?: number }>;
  /** Patches to apply to the acting nation's military stats. */
  milPatch?: { readiness?: number; morale?: number };
}

/** Run the AI director for one turn. Evaluates a random subset of non-player
 *  nations and returns their decisions + relationship/military patches. */
export function runAIDirector(countries: Country[], tick: number): {
  decisions: AIDecision[];
  aiDecisionsMade: number;
} {
  const aiNations = countries.filter((c) => c.id !== PLAYER_CODE);
  const actors = aiNations.filter(() => Math.random() < 0.15);
  const decisions: AIDecision[] = [];

  for (const c of actors) {
    const decision = evaluate(c, countries, tick);
    if (decision) decisions.push(decision);
  }

  return { decisions, aiDecisionsMade: decisions.length };
}

/** Reset escalation tracking state (for tests and new game sessions). */
export function resetEscalationState(): void {
  casusBelliMap.clear();
  ultimatumMap.clear();
}

/** Evaluate one nation's situation and decide on an action (if any). */
function evaluate(c: Country, all: Country[], tick: number): AIDecision | null {
  const enemy = worstEnemy(c);
  const friend = bestFriend(c);
  const myPower = powerScore(c);
  const atStr = at();

  if (!enemy) {
    return evaluateDiplomacy(c, friend, atStr, tick);
  }

  const target = all.find((x) => x.id === enemy.countryCode);
  const level = classifyEscalation(enemy.tension);

  switch (level) {
    case EscalationLevel.War:
      return evaluateWarDeclaration(c, target, enemy, myPower, tick, atStr);

    case EscalationLevel.DiplomaticCrisis:
      return evaluateCrisis(c, target, enemy, myPower, tick, atStr);

    case EscalationLevel.BorderTensions:
      return evaluateBorderTensions(c, enemy, tick, atStr);

    case EscalationLevel.DiplomaticFriction:
      return evaluateDiplomaticFriction(c, enemy, tick, atStr);

    default:
      return evaluateDiplomacy(c, friend, atStr, tick);
  }
}

/** Level 4 — War Declaration (gated by escalation ladder prerequisites). */
function evaluateWarDeclaration(
  c: Country,
  target: Country | undefined,
  enemy: Relationship,
  myPower: number,
  tick: number,
  atStr: string,
): AIDecision | null {
  if (!target) return null;
  if (powerScore(target) >= myPower * 1.3) return null;

  // Accumulate casus belli for this pair
  const key = casusBelliKey(c.id, enemy.countryCode);
  const current = getCasusBelli(c.id, enemy.countryCode);
  casusBelliMap.set(key, accumulateCasusBelli(current, enemy.tension));

  const ctx: IEscalationContext = {
    tick,
    tension: enemy.tension,
    casusBelli: getCasusBelli(c.id, enemy.countryCode),
    ultimatumTick: getUltimatumTick(c.id, enemy.countryCode),
    hasSharedBorder: hasSharedBorder(c, target),
    hasNavalProjection: hasNavalProjection(c),
  };

  const gate = canDeclareWar(ctx);
  if (!gate.allowed) return null;

  casusBelliMap.delete(key);
  ultimatumMap.delete(key);

  return {
    events: [
      {
        type: "war.declared",
        at: atStr,
        tick,
        aggressor: c.id,
        target: enemy.countryCode,
        reason: pick(WAR_REASONS),
      },
    ],
    relPatches: new Map([
      [enemy.countryCode, { tension: 95, affinity: clamp(enemy.affinity - 40, -100, 100) }],
    ]),
    milPatch: { readiness: clamp(c.military.readiness + 10, 10, 100) },
  };
}

/** Level 3 — Diplomatic Crisis: mobilize, issue ultimatum, or seek peace if losing. */
function evaluateCrisis(
  c: Country,
  target: Country | undefined,
  enemy: Relationship,
  myPower: number,
  tick: number,
  atStr: string,
): AIDecision | null {
  // Accumulate casus belli at crisis level
  const key = casusBelliKey(c.id, enemy.countryCode);
  const current = getCasusBelli(c.id, enemy.countryCode);
  casusBelliMap.set(key, accumulateCasusBelli(current, enemy.tension));

  // If losing badly, seek peace
  if (target && powerScore(target) > myPower * 1.5 && Math.random() < 0.5) {
    return {
      events: [
        {
          type: "peace.declared",
          at: atStr,
          tick,
          initiator: c.id,
          target: enemy.countryCode,
          terms: pick(PEACE_TERMS),
        },
      ],
      relPatches: new Map([
        [enemy.countryCode, { tension: clamp(enemy.tension - 50, 0, 100), affinity: clamp(enemy.affinity + 15, -100, 100) }],
      ]),
    };
  }

  // Issue ultimatum (records the tick for the 3-turn expiry check)
  if (Math.random() < 0.6) {
    ultimatumMap.set(key, tick);
    return {
      events: [
        {
          type: "ai.decision",
          at: atStr,
          tick,
          country: c.id,
          action: `issue ultimatum to ${enemy.countryCode}`,
          rationale: pick(CRISIS_RATIONALES),
        },
      ],
      relPatches: new Map([
        [enemy.countryCode, { tension: clamp(enemy.tension + 5, 0, 100) }],
      ]),
      milPatch: { readiness: clamp(c.military.readiness + 10, 10, 100) },
    };
  }

  return null;
}

/** Level 2 — Border Tensions: sanctions, covert ops, troop posturing. */
function evaluateBorderTensions(
  c: Country,
  enemy: Relationship,
  tick: number,
  atStr: string,
): AIDecision | null {
  if (Math.random() < 0.5) {
    return {
      events: [
        {
          type: "ai.decision",
          at: atStr,
          tick,
          country: c.id,
          action: `escalate border tensions with ${enemy.countryCode}`,
          rationale: pick(BORDER_TENSION_RATIONALES),
        },
      ],
      relPatches: new Map([
        [enemy.countryCode, { tension: clamp(enemy.tension + 8, 0, 100), affinity: clamp(enemy.affinity - 10, -100, 100) }],
      ]),
      milPatch: { readiness: clamp(c.military.readiness + 5, 10, 100) },
    };
  }
  return null;
}

/** Level 1 — Diplomatic Friction: verbal warnings, tariff threats, ambassador recalls. */
function evaluateDiplomaticFriction(
  c: Country,
  enemy: Relationship,
  tick: number,
  atStr: string,
): AIDecision | null {
  if (Math.random() < 0.4) {
    return {
      events: [
        {
          type: "ai.decision",
          at: atStr,
          tick,
          country: c.id,
          action: `diplomatic friction with ${enemy.countryCode}`,
          rationale: pick(FRICTION_RATIONALES),
        },
      ],
      relPatches: new Map([
        [enemy.countryCode, { tension: clamp(enemy.tension + 5, 0, 100), affinity: clamp(enemy.affinity - 5, -100, 100) }],
      ]),
    };
  }
  return null;
}

/** Level 0 — Normal Relations: improve relations, mobilize if unstable, seek trade. */
function evaluateDiplomacy(
  c: Country,
  friend: Relationship | null,
  atStr: string,
  tick: number,
): AIDecision | null {
  // ---- Scenario D: Low stability + weak economy → military mobilization ----
  if (c.economy.stability < 35 && c.military.readiness < 60) {
    if (Math.random() < 0.5) {
      return {
        events: [
          {
            type: "ai.decision",
            at: atStr,
            tick,
            country: c.id,
            action: "mobilize armed forces",
            rationale: "internal instability — junta consolidating power",
          },
        ],
        relPatches: new Map(),
        milPatch: { readiness: clamp(c.military.readiness + 15, 10, 100), morale: clamp(c.military.morale - 5, 10, 100) },
      };
    }
  }

  // ---- Scenario C: Strong economy, low tensions → improve relations ---------
  if (c.economy.stability >= 70 && friend && friend.affinity < 60) {
    if (Math.random() < 0.4) {
      return {
        events: [
          {
            type: "ai.decision",
            at: atStr,
            tick,
            country: c.id,
            action: `improve relations with ${friend.countryCode}`,
            rationale: pick(DIPLO_RATIONALES),
          },
        ],
        relPatches: new Map([
          [friend.countryCode, { affinity: clamp(friend.affinity + 12, -100, 100), tension: clamp(friend.tension - 8, 0, 100) }],
        ]),
      };
    }
  }

  // ---- Scenario E: Wealthy and stable → seek trade treaty with a friend -----
  if (c.economy.treasury > 500e9 && friend && friend.affinity >= 35) {
    if (Math.random() < 0.3) {
      return {
        events: [
          {
            type: "diplomacy.treaty-signed",
            at: atStr,
            parties: [c.id, friend.countryCode],
            kind: "trade",
            durationYears: Math.round(3 + Math.random() * 7),
          },
          {
            type: "ai.decision",
            at: atStr,
            tick,
            country: c.id,
            action: `sign trade agreement with ${friend.countryCode}`,
            rationale: "economic expansion strategy",
          },
        ],
        relPatches: new Map([
          [friend.countryCode, { affinity: clamp(friend.affinity + 8, -100, 100) }],
        ]),
      };
    }
  }

  return null;
}
