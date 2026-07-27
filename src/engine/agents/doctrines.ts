// Doctrine system — assigns geopolitical personas to AI-controlled nations.
// Each doctrine shapes the agent's personality, strategic goals, and
// decision-making biases.

import type { IAgentPersonality } from './memory/agent-memory.js';
import type { EntityId } from '../core/interfaces/entity.interface.js';

export interface IDoctrineGoal {
  readonly description: string;
  readonly priority: number;
}

export type DoctrineType =
  | 'pragmatic-neutrality'
  | 'regional-hegemon'
  | 'economic-mercantile'
  | 'isolationist-defense';

export interface IDoctrine {
  readonly type: DoctrineType;
  readonly name: string;
  readonly description: string;
  readonly personality: IAgentPersonality;
  readonly goals: IDoctrineGoal[];
  /** Preferred action types for this doctrine, ordered by priority. */
  readonly preferredActions: readonly string[];
  /** Actions this doctrine avoids. */
  readonly avoidedActions: readonly string[];
}

export const DOCTRINES: Record<DoctrineType, IDoctrine> = {
  'pragmatic-neutrality': {
    type: 'pragmatic-neutrality',
    name: 'Pragmatic Neutrality',
    description:
      'Focuses on regional trade and balanced diplomacy. Avoids military entanglements, ' +
      'prefers mediation and economic cooperation over confrontation.',
    personality: { aggressiveness: 0.25, riskTolerance: 0.4, trustPropensity: 0.6 },
    goals: [
      { description: 'Maintain neutral diplomatic stance with all neighbors', priority: 1 },
      { description: 'Establish balanced trade routes with regional partners', priority: 2 },
      { description: 'Avoid military alliances and defense pacts', priority: 3 },
    ],
    preferredActions: [
      'diplomacy.improve-relations',
      'economy.establish-trade-route',
      'diplomacy.propose-treaty',
      'politics.maintain-stability',
    ],
    avoidedActions: ['war.declared', 'military.deploy-unit', 'economy.impose-sanction'],
  },

  'regional-hegemon': {
    type: 'regional-hegemon',
    name: 'Regional Hegemon',
    description:
      'Focuses on sphere of influence, military readiness, and defense pacts. ' +
      'Projects power to neighboring states and expects deference.',
    personality: { aggressiveness: 0.7, riskTolerance: 0.6, trustPropensity: 0.35 },
    goals: [
      { description: 'Establish defense pacts with neighboring states', priority: 1 },
      { description: 'Maintain high military readiness and force projection', priority: 2 },
      { description: 'Deter rival powers from encroaching on sphere of influence', priority: 3 },
    ],
    preferredActions: [
      'military.deploy-unit',
      'diplomacy.propose-treaty',
      'military.order-garrison',
      'war.move-ordered',
    ],
    avoidedActions: ['economy.adjust-tax'],
  },

  'economic-mercantile': {
    type: 'economic-mercantile',
    name: 'Economic Mercantile',
    description:
      'Focuses on commodity market dominance and trade surpluses. ' +
      'Uses economic leverage and sanctions as primary tools of statecraft.',
    personality: { aggressiveness: 0.4, riskTolerance: 0.55, trustPropensity: 0.5 },
    goals: [
      { description: 'Maximize trade surplus and commodity exports', priority: 1 },
      { description: 'Establish trade routes with all viable partners', priority: 2 },
      { description: 'Use sanctions to protect economic interests', priority: 3 },
    ],
    preferredActions: [
      'economy.establish-trade-route',
      'economy.invest',
      'economy.impose-sanction',
      'economy.adjust-tax',
    ],
    avoidedActions: ['war.declared', 'war.move-ordered'],
  },

  'isolationist-defense': {
    type: 'isolationist-defense',
    name: 'Isolationist Defense',
    description:
      'Focuses on domestic infrastructure, high border security, and zero foreign ' +
      'entanglements. Prioritizes self-sufficiency and garrison strength.',
    personality: { aggressiveness: 0.3, riskTolerance: 0.3, trustPropensity: 0.25 },
    goals: [
      { description: 'Maintain strong border garrisons and domestic defense', priority: 1 },
      { description: 'Minimize foreign diplomatic entanglements', priority: 2 },
      { description: 'Invest in domestic economic self-sufficiency', priority: 3 },
    ],
    preferredActions: [
      'military.order-garrison',
      'military.set-supply-source',
      'economy.invest',
      'politics.maintain-stability',
    ],
    avoidedActions: [
      'diplomacy.propose-treaty',
      'economy.establish-trade-route',
      'war.declared',
      'military.deploy-unit',
    ],
  },
};

/** Assign doctrines to the top sovereign powers by GDP ranking.
 *  The largest economies get the most doctrinally distinct personas. */
export function assignDoctrinesByGdp(
  countryIds: readonly EntityId[],
  gdpRanking: Map<EntityId, number>,
): Map<EntityId, DoctrineType> {
  const sorted = [...countryIds].sort((a, b) => {
    const gdpA = gdpRanking.get(a) ?? 0;
    const gdpB = gdpRanking.get(b) ?? 0;
    return gdpB - gdpA;
  });

  const assignments = new Map<EntityId, DoctrineType>();
  const doctrineCycle: DoctrineType[] = [
    'regional-hegemon',
    'economic-mercantile',
    'pragmatic-neutrality',
    'isolationist-defense',
  ];

  for (let i = 0; i < sorted.length; i++) {
    const countryId = sorted[i]!;
    if (i < 4) {
      assignments.set(countryId, doctrineCycle[i]!);
    } else {
      assignments.set(countryId, doctrineCycle[i % doctrineCycle.length]!);
    }
  }

  return assignments;
}

/** Get the doctrine for a country, or undefined if none assigned. */
export function getDoctrine(countryId: EntityId, assignments: Map<EntityId, DoctrineType>): IDoctrine | undefined {
  const type = assignments.get(countryId);
  return type ? DOCTRINES[type] : undefined;
}
