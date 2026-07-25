// aiDirector — the AI brain for non-player nations. Each turn, a subset of
// nations evaluates their geopolitical situation and may take autonomous
// actions: escalating toward war, seeking peace, improving relations, or
// mobilizing their military. The director produces GameEvents and mutates
// relationships / military state. The player's own nation (PLAYER_CODE) is
// always excluded — only AI nations act here.

import type { Country, GameEvent, Relationship } from "./shared/types.js";

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
  // Only ~15% of AI nations act each turn — keeps the log readable and the
  // world from descending into instant global war.
  const actors = aiNations.filter(() => Math.random() < 0.15);
  const decisions: AIDecision[] = [];

  for (const c of actors) {
    const decision = evaluate(c, countries, tick);
    if (decision) decisions.push(decision);
  }

  return { decisions, aiDecisionsMade: decisions.length };
}

/** Evaluate one nation's situation and decide on an action (if any). */
function evaluate(c: Country, all: Country[], tick: number): AIDecision | null {
  const enemy = worstEnemy(c);
  const friend = bestFriend(c);
  const myPower = powerScore(c);
  const atStr = at();

  // ---- Scenario A: High tension with a weaker neighbor → declare war --------
  if (enemy && enemy.tension >= 75) {
    const target = all.find((x) => x.id === enemy.countryCode);
    if (target && powerScore(target) < myPower * 1.3) {
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
  }

  // ---- Scenario B: At war (very high tension) but losing → seek peace --------
  if (enemy && enemy.tension >= 85) {
    const target = all.find((x) => x.id === enemy.countryCode);
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
  }

  // ---- Scenario C: Strong economy, low tensions → improve relations ---------
  if (c.economy.stability >= 70 && (!enemy || enemy.tension < 40) && friend && friend.affinity < 60) {
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
