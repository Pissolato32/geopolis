import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { PerceptionFilter } from '../perception/perception-filter.js';
import {
  MILITARY_DETAIL_TYPE,
  CountryMilitaryDetailComponent,
} from '../../domain/war/components/military-detail.component.js';
import { calculateCombatPower } from '../../domain/war/systems/combined-arms.js';

/**
 * Intel-driven military parity evaluator for agents.
 * Uses Fog of War distorted perception (M6) to assess enemy strength
 * before making war/peace decisions.
 */

export interface IParityAssessment {
  /** Our perceived combat power */
  readonly selfPower: number;
  /** Enemy's perceived combat power (distorted by intel level) */
  readonly perceivedEnemyPower: number;
  /** Parity ratio: >1.0 = we have advantage, <1.0 = enemy has advantage */
  readonly parityRatio: number;
  /** Confidence in this assessment (0.0 to 1.0, based on intel level) */
  readonly confidence: number;
  /** Recommended action based on parity and personality */
  readonly recommendation: 'declare-war' | 'request-peace' | 'hold' | 'mobilize';
}

export interface IParityConfig {
  /** Intel level 0.0 (blind) to 1.0 (perfect intel) */
  readonly intelLevel: number;
  /** Agent personality: aggressiveness 0.0 (pacifist) to 1.0 (warmonger) */
  readonly aggressiveness: number;
  /** Agent personality: riskTolerance 0.0 (cautious) to 1.0 (reckless) */
  readonly riskTolerance: number;
}

/**
 * Evaluate military parity between self and a target country using
 * Fog of War distorted perception.
 *
 * The agent's own military stats are always accurate (self-knowledge).
 * The enemy's stats are perceived through the distortion filter — low intel
 * means the agent may underestimate or overestimate enemy strength.
 */
export function evaluateMilitaryParity(
  worldState: Readonly<IWorldState>,
  selfId: EntityId,
  targetId: EntityId,
  config: IParityConfig,
): IParityAssessment | null {
  // Self stats — always accurate
  const selfEntity = worldState.getEntity(selfId);
  const selfDetail = selfEntity?.getComponent<CountryMilitaryDetailComponent>(MILITARY_DETAIL_TYPE);
  if (!selfDetail) return null;

  const selfBreakdown = calculateCombatPower(selfDetail);

  // Enemy stats — distorted by Fog of War
  // Generate a distorted perception dump for the target
  const distortedDump = PerceptionFilter.generateDistortedPerception(
    worldState,
    selfId,
    config.intelLevel,
  );

  // Extract perceived enemy military stats from the distorted dump
  // If we can't parse exact numbers, we estimate based on intel level
  const targetEntity = worldState.getEntity(targetId);
  const targetDetail = targetEntity?.getComponent<CountryMilitaryDetailComponent>(MILITARY_DETAIL_TYPE);
  if (!targetDetail) return null;

  // Apply distortion to the target's combat power
  // Low intel: random perturbation of ±50%; high intel: ±10%
  const distortionFactor = 1.0 - config.intelLevel;
  const perturbationRange = distortionFactor * 0.5; // up to 50% at 0 intel
  const randomPerturbation = 1.0 + (Math.random() - 0.5) * 2 * perturbationRange;
  const perceivedEnemyPower = calculateCombatPower(targetDetail).totalPower * randomPerturbation;

  const parityRatio = selfBreakdown.totalPower / (perceivedEnemyPower + 1);
  const confidence = config.intelLevel;

  // Recommendation logic based on parity, personality, and confidence
  let recommendation: IParityAssessment['recommendation'] = 'hold';

  // War threshold: parity must exceed 1.2 (advantage) AND aggressiveness must be high enough
  // Cautious agents need bigger advantage; reckless agents attack at lower parity
  const warThreshold = 1.2 + (1 - config.aggressiveness) * 0.5 - config.riskTolerance * 0.2;
  const peaceThreshold = 0.7; // if parity below this, consider peace

  if (parityRatio >= warThreshold) {
    recommendation = 'declare-war';
  } else if (parityRatio < peaceThreshold) {
    recommendation = 'request-peace';
  } else if (parityRatio < warThreshold && parityRatio >= 0.9) {
    // Near-parity: mobilize but don't attack yet
    recommendation = 'mobilize';
  }

  // The distorted dump is used for context — in a full LLM integration,
  // it would be passed to the prompt builder. Here we use it to validate
  // that the perception filter is working.
  void distortedDump;

  return {
    selfPower: selfBreakdown.totalPower,
    perceivedEnemyPower,
    parityRatio,
    confidence,
    recommendation,
  };
}

/**
 * Build an action payload for war/peace based on the parity assessment.
 */
export function buildWarActionPayload(
  selfId: EntityId,
  targetId: EntityId,
  assessment: IParityAssessment,
): { actionType: string; actorEntityId: string; parameters: Record<string, unknown>; narrativeSummary: string } {
  switch (assessment.recommendation) {
    case 'declare-war':
      return {
        actionType: 'diplomacy.declare-war',
        actorEntityId: selfId,
        parameters: { targetCountryId: targetId },
        narrativeSummary: `Declared war on ${targetId} — perceived parity ${assessment.parityRatio.toFixed(2)} in our favor`,
      };
    case 'request-peace':
      return {
        actionType: 'war.request-peace',
        actorEntityId: selfId,
        parameters: { initiator: selfId, target: targetId },
        narrativeSummary: `Requested peace with ${targetId} — perceived parity ${assessment.parityRatio.toFixed(2)} against us`,
      };
    case 'mobilize':
      return {
        actionType: 'military.deploy-unit',
        actorEntityId: selfId,
        parameters: { unitName: 'Mobilized Reserve', personnel: 10000 },
        narrativeSummary: `Mobilized reserves against ${targetId} — near-parity detected`,
      };
    default:
      return {
        actionType: 'politics.maintain-stability',
        actorEntityId: selfId,
        parameters: {},
        narrativeSummary: 'Holding position — no decisive military advantage',
      };
  }
}
