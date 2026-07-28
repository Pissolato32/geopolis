/**
 * Pure functions for organic diplomatic AI decision-making.
 *
 * War is never scripted — it emerges from the interplay of three factors:
 *   A) Diplomatic relations (affinity below -0.8 = critically hostile)
 *   B) Tension/threat level (above 0.85 = imminent conflict risk)
 *   C) Military balance (attacker must perceive an advantage, OR be acting
 *      defensively as part of a coalition against a global threat)
 *
 * No state is mutated here — these functions only compute decisions.
 * The calling system emits events; reducers apply state changes.
 */

import { RelationComponent } from '../components/relation.component.js';
import { InfamyComponent } from '../components/infamy.component.js';
import { MilitaryUnitComponent } from '../../war/components/war.components.js';

const AFFINITY_THRESHOLD = -0.8;
const TENSION_THRESHOLD = 0.85;
const INFAMY_WAR_TRIGGER = 0.7;
const MILITARY_ADVANTAGE_RATIO = 1.3;
const COALITION_INFAMY_THRESHOLD = 0.6;
const INFAMY_DECAY_GRACE_PERIOD = 20;
const INFAMY_DECAY_RATE = 0.005;

export interface MilitaryBalance {
  readonly aggressorPower: number;
  readonly defenderPower: number;
  readonly ratio: number;
}

export interface WarDecisionInputs {
  readonly aggressorId: string;
  readonly targetId: string;
  readonly relation: RelationComponent | undefined;
  readonly targetInfamy: InfamyComponent | undefined;
  readonly militaryBalance: MilitaryBalance;
  readonly isDefensiveCoalition: boolean;
}

export interface WarDecisionResult {
  readonly shouldDeclareWar: boolean;
  readonly reason: string;
  readonly isDefensive: boolean;
}

/**
 * Compute a country's military power from its units (readiness * morale * personnel).
 * Pure: no side effects, deterministic given the same inputs.
 */
export function computeMilitaryPower(
  units: ReadonlyArray<MilitaryUnitComponent>,
): number {
  return units.reduce(
    (sum, u) => sum + u.personnel * u.readiness * u.morale,
    0,
  );
}

/**
 * Compute the military balance ratio between two countries.
 * Returns a ratio > 1.0 if the aggressor has more power, < 1.0 if weaker.
 */
export function computeMilitaryBalance(
  aggressorUnits: ReadonlyArray<MilitaryUnitComponent>,
  defenderUnits: ReadonlyArray<MilitaryUnitComponent>,
): MilitaryBalance {
  const aggressorPower = computeMilitaryPower(aggressorUnits);
  const defenderPower = computeMilitaryPower(defenderUnits);
  const ratio = defenderPower > 0 ? aggressorPower / defenderPower : aggressorPower > 0 ? 99 : 1;
  return { aggressorPower, defenderPower, ratio };
}

/**
 * The core decision function. A country declares war ONLY if all three
 * conditions are met:
 *
 * A) Relations are critically low: affinity < -0.8
 * B) Tension is above 0.85 (sustained hostility, not a one-off dip)
 * C) Military advantage OR defensive coalition:
 *    - The aggressor's military power is at least 1.3x the defender's, OR
 *    - The aggressor is acting as part of a defensive coalition against
 *      a country whose infamy exceeds 0.7 (a global threat)
 *
 * If the target's infamy is above 0.7, the bar for war is lower — the
 * international community tolerates preemptive action against pariahs.
 */
export function evaluateWarDeclaration(inputs: WarDecisionInputs): WarDecisionResult {
  const { relation, targetInfamy, militaryBalance, isDefensiveCoalition } = inputs;

  if (!relation) {
    return { shouldDeclareWar: false, reason: 'No diplomatic relation exists', isDefensive: false };
  }

  // Condition A: critically low affinity
  if (relation.affinity > AFFINITY_THRESHOLD) {
    return {
      shouldDeclareWar: false,
      reason: `Affinity ${relation.affinity.toFixed(2)} above critical threshold`,
      isDefensive: false,
    };
  }

  // Condition B: tension above threshold
  if (relation.tension < TENSION_THRESHOLD) {
    return {
      shouldDeclareWar: false,
      reason: `Tension ${relation.tension.toFixed(2)} below war threshold`,
      isDefensive: false,
    };
  }

  // Condition C: military advantage or defensive coalition
  const targetIsGlobalThreat = (targetInfamy?.infamyScore ?? 0) >= INFAMY_WAR_TRIGGER;
  const hasMilitaryAdvantage = militaryBalance.ratio >= MILITARY_ADVANTAGE_RATIO;

  if (isDefensiveCoalition && targetIsGlobalThreat) {
    return {
      shouldDeclareWar: true,
      reason: `Defensive coalition war against global threat (infamy ${(targetInfamy?.infamyScore ?? 0).toFixed(2)})`,
      isDefensive: true,
    };
  }

  if (targetIsGlobalThreat) {
    // Preemptive strike against a pariah — lower military bar (1.1x)
    if (militaryBalance.ratio >= 1.1) {
      return {
        shouldDeclareWar: true,
        reason: `Preemptive action against global threat (infamy ${(targetInfamy?.infamyScore ?? 0).toFixed(2)}, ratio ${militaryBalance.ratio.toFixed(2)})`,
        isDefensive: false,
      };
    }
  }

  if (hasMilitaryAdvantage) {
    return {
      shouldDeclareWar: true,
      reason: `Military advantage (ratio ${militaryBalance.ratio.toFixed(2)}) with hostile relations`,
      isDefensive: false,
    };
  }

  return {
    shouldDeclareWar: false,
    reason: `Insufficient military advantage (ratio ${militaryBalance.ratio.toFixed(2)} < ${MILITARY_ADVANTAGE_RATIO})`,
    isDefensive: false,
  };
}

/**
 * Compute infamy increase for an unprovoked war declaration.
 * Unprovoked = the target was NOT a global threat (infamy < 0.7).
 */
export function computeInfamyIncrease(
  isProvoked: boolean,
  targetInfamy: number,
): number {
  if (isProvoked) return 0;
  // Unprovoked aggression adds 0.15 infamy, plus extra if target was peaceful
  const baseIncrease = 0.15;
  const peacefulBonus = targetInfamy < 0.3 ? 0.05 : 0;
  return baseIncrease + peacefulBonus;
}

/**
 * Compute infamy decay per tick. Infamy decays only after a grace period
 * of 20 ticks since the last aggressive act, at 0.5% per tick.
 */
export function computeInfamyDecay(
  currentInfamy: number,
  ticksSinceAggression: number,
): number {
  if (ticksSinceAggression < INFAMY_DECAY_GRACE_PERIOD) return currentInfamy;
  return Math.max(0, currentInfamy - INFAMY_DECAY_RATE);
}

/**
 * Determine which countries should join a coalition against an aggressor.
 * A country joins if its infamy score is low (it's a "good actor") and its
 * affinity toward the aggressor is below 0 (neutral-to-hostile relations).
 */
export function evaluateCoalitionMembership(
  aggressorId: string,
  aggressorInfamy: number,
  candidateRelations: ReadonlyArray<{
    countryId: string;
    relation: RelationComponent;
    infamy: number;
  }>,
): string[] {
  if (aggressorInfamy < COALITION_INFAMY_THRESHOLD) return [];

  return candidateRelations
    .filter(
      (c) =>
        c.countryId !== aggressorId &&
        c.infamy < 0.3 &&
        c.relation.affinity < 0,
    )
    .map((c) => c.countryId);
}

/**
 * Compute the economic penalty multiplier from infamy.
 * At infamy 0.0, no penalty. At infamy 1.0, GDP growth is reduced by 50%
 * and trade income is reduced by 70%.
 */
export function computeInfamyEconomicPenalty(infamyScore: number): {
  gdpGrowthPenalty: number;
  tradeIncomePenalty: number;
  inflationIncrease: number;
} {
  return {
    gdpGrowthPenalty: infamyScore * 0.5,
    tradeIncomePenalty: infamyScore * 0.7,
    inflationIncrease: infamyScore * 0.08,
  };
}

export const THRESHOLDS = {
  AFFINITY_THRESHOLD,
  TENSION_THRESHOLD,
  INFAMY_WAR_TRIGGER,
  MILITARY_ADVANTAGE_RATIO,
  COALITION_INFAMY_THRESHOLD,
  INFAMY_DECAY_GRACE_PERIOD,
  INFAMY_DECAY_RATE,
} as const;
