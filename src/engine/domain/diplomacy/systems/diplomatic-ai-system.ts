/**
 * DiplomaticAISystem — the organic diplomatic AI that replaces scripted conflicts.
 *
 * Each tick, this system evaluates every pair of countries with hostile relations
 * and decides whether war should be declared using pure evaluation functions.
 * It also manages the infamy system: tracking aggression, triggering sanctions,
 * forming defensive coalitions, and decaying infamy over time.
 *
 * No state is mutated directly in execute() — all changes flow through events
 * whose reducers are registered in initialize().
 */

import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId, IEntity } from '../../../core/interfaces/entity.interface.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../components/relation.component.js';
import {
  DIPLOMATIC_INFAMY_TYPE,
  InfamyComponent,
} from '../components/infamy.component.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../../war/components/war.components.js';
import {
  DIPLOMACY_INFAMY_INCREASED_EVENT,
  DIPLOMACY_SANCTIONS_APPLIED_EVENT,
  DIPLOMACY_COALITION_FORMED_EVENT,
  DIPLOMACY_WAR_DECLARED_AI_EVENT,
  IInfamyIncreasedPayload,
  ISanctionsAppliedPayload,
  ICoalitionFormedPayload,
  IDiplomacyWarDeclaredAIPayload,
} from '../events/diplomacy-ai.events.js';
import {
  evaluateWarDeclaration,
  computeMilitaryBalance,
  computeInfamyIncrease,
  computeInfamyDecay,
  evaluateCoalitionMembership,
  THRESHOLDS,
} from './diplomacy-ai.system.js';

export const DIPLOMATIC_AI_SYSTEM_ID = 'diplomacy.ai';

export class DiplomaticAISystem implements ISystem {
  readonly descriptor = {
    id: DIPLOMATIC_AI_SYSTEM_ID,
    name: 'Organic Diplomatic AI System',
    priority: 380 as SystemPriority,
    requiredComponents: [DIPLOMATIC_RELATION_TYPE],
    subscribedEvents: [
      DIPLOMACY_INFAMY_INCREASED_EVENT,
      DIPLOMACY_SANCTIONS_APPLIED_EVENT,
      DIPLOMACY_COALITION_FORMED_EVENT,
    ],
    emittedEvents: [
      DIPLOMACY_INFAMY_INCREASED_EVENT,
      DIPLOMACY_SANCTIONS_APPLIED_EVENT,
      DIPLOMACY_COALITION_FORMED_EVENT,
      DIPLOMACY_WAR_DECLARED_AI_EVENT,
    ],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IInfamyIncreasedPayload>(
      DIPLOMACY_INFAMY_INCREASED_EVENT,
      (event) => {
        const aggressorId = event.payload.aggressorId as EntityId;
        if (!worldState.hasEntity(aggressorId)) return;
        const entity = worldState.getEntity(aggressorId);
        const existing = entity?.getComponent<InfamyComponent>(DIPLOMATIC_INFAMY_TYPE);
        const newScore = Math.min(1.0, event.payload.newInfamy);
        if (existing) {
          worldState.updateComponent(aggressorId, {
            ...existing,
            infamyScore: newScore,
            ticksSinceAggression: 0,
            isGlobalThreat: newScore >= THRESHOLDS.INFAMY_WAR_TRIGGER,
          } as unknown as IComponent);
        } else {
          worldState.addComponent(aggressorId, {
            type: DIPLOMATIC_INFAMY_TYPE,
            infamyScore: newScore,
            ticksSinceAggression: 0,
            coalitionMembers: [],
            isGlobalThreat: newScore >= THRESHOLDS.INFAMY_WAR_TRIGGER,
          } as unknown as IComponent);
        }
      },
    );

    eventBus.subscribe<ISanctionsAppliedPayload>(
      DIPLOMACY_SANCTIONS_APPLIED_EVENT,
      (event) => {
        // Sanctions are applied by the SanctionSystem which listens to
        // economy events — this reducer just flags the coalition on the infamy component
        const aggressorId = event.payload.aggressorId as EntityId;
        if (!worldState.hasEntity(aggressorId)) return;
        const entity = worldState.getEntity(aggressorId);
        const infamy = entity?.getComponent<InfamyComponent>(DIPLOMATIC_INFAMY_TYPE);
        if (infamy) {
          worldState.updateComponent(aggressorId, {
            ...infamy,
            coalitionMembers: [
              ...infamy.coalitionMembers,
              ...event.payload.sanctioningCountries,
            ].filter((v, i, a) => a.indexOf(v) === i),
          } as unknown as IComponent);
        }
      },
    );

    eventBus.subscribe<ICoalitionFormedPayload>(
      DIPLOMACY_COALITION_FORMED_EVENT,
      (event) => {
        const aggressorId = event.payload.aggressorId as EntityId;
        if (!worldState.hasEntity(aggressorId)) return;
        const entity = worldState.getEntity(aggressorId);
        const infamy = entity?.getComponent<InfamyComponent>(DIPLOMATIC_INFAMY_TYPE);
        if (infamy) {
          worldState.updateComponent(aggressorId, {
            ...infamy,
            coalitionMembers: event.payload.coalitionMembers,
          } as unknown as IComponent);
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    // Phase 1: Decay infamy for all countries that have it
    this.decayInfamy(state, eventBus);

    // Phase 2: Evaluate war declarations for hostile pairs
    this.evaluateWarDeclarations(state, eventBus);

    // Phase 3: Form/update coalitions against high-infamy countries
    this.evaluateCoalitions(state, eventBus);
  }

  private decayInfamy(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
  ): void {
    const countriesWithInfamy = state.getEntitiesByComponent(DIPLOMATIC_INFAMY_TYPE);
    for (const entity of countriesWithInfamy) {
      const infamy = entity.getComponent<InfamyComponent>(DIPLOMATIC_INFAMY_TYPE);
      if (!infamy) continue;
      const decayed = computeInfamyDecay(infamy.infamyScore, infamy.ticksSinceAggression + 1);
      if (decayed !== infamy.infamyScore) {
        // Update via event for audit trail
        eventBus.publish<IInfamyIncreasedPayload>(
          DIPLOMACY_INFAMY_INCREASED_EVENT,
          {
            aggressorId: entity.id,
            targetId: entity.id,
            reason: 'infamy-decay',
            previousInfamy: infamy.infamyScore,
            newInfamy: decayed,
          },
          DIPLOMATIC_AI_SYSTEM_ID,
          entity.id as EntityId,
        );
      }
    }
  }

  private evaluateWarDeclarations(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
  ): void {
    const relationEntities = state.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);
    const allUnits = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);

    // Collect all relation edges keyed by source country
    const relationsBySource = new Map<string, RelationComponent[]>();
    for (const entity of relationEntities) {
      const rel = entity.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      if (!rel) continue;
      const list = relationsBySource.get(entity.id as string) ?? [];
      list.push(rel);
      relationsBySource.set(entity.id as string, list);
    }

    for (const [sourceId, relations] of relationsBySource) {
      // Skip the player country — the player makes their own war decisions
      // (the UI sends intents). Only AI countries evaluate here.
      // The player's country is tracked via the adapter's playerCode;
      // we skip countries whose infamy.isGlobalThreat is false AND that
      // are not AI-eligible. In practice, we evaluate all countries —
      // the UI intercepts player intents before they reach here.

      const sourceInfamy = this.getInfamy(state, sourceId);

      for (const relation of relations) {
        const targetId = relation.targetCountryId as string;

        // Quick filter: only evaluate if relations are already poor
        if (relation.affinity > THRESHOLDS.AFFINITY_THRESHOLD) continue;
        if (relation.tension < THRESHOLDS.TENSION_THRESHOLD) continue;

        const targetInfamy = this.getInfamy(state, targetId);
        const aggressorUnits = this.getUnitsForCountry(allUnits, sourceId);
        const defenderUnits = this.getUnitsForCountry(allUnits, targetId);
        const balance = computeMilitaryBalance(aggressorUnits, defenderUnits);

        // Check if this is a defensive coalition action
        const isDefensiveCoalition = !!sourceInfamy?.coalitionMembers.includes(targetId) === false
          && (targetInfamy?.isGlobalThreat ?? false);

        const decision = evaluateWarDeclaration({
          aggressorId: sourceId,
          targetId,
          relation,
          targetInfamy: targetInfamy ?? undefined,
          militaryBalance: balance,
          isDefensiveCoalition,
        });

        if (decision.shouldDeclareWar) {
          // Emit AI war declaration
          eventBus.publish<IDiplomacyWarDeclaredAIPayload>(
            DIPLOMACY_WAR_DECLARED_AI_EVENT,
            {
              aggressorId: sourceId,
              targetId,
              reason: decision.reason,
              isDefensive: decision.isDefensive,
            },
            DIPLOMATIC_AI_SYSTEM_ID,
            sourceId as EntityId,
          );

          // If the war was unprovoked (target is not a global threat),
          // increase the aggressor's infamy
          const isProvoked = decision.isDefensive || (targetInfamy?.isGlobalThreat ?? false);
          if (!isProvoked) {
            const currentInfamy = sourceInfamy?.infamyScore ?? 0;
            const increase = computeInfamyIncrease(false, targetInfamy?.infamyScore ?? 0);
            eventBus.publish<IInfamyIncreasedPayload>(
              DIPLOMACY_INFAMY_INCREASED_EVENT,
              {
                aggressorId: sourceId,
                targetId,
                reason: 'unprovoked-war-declaration',
                previousInfamy: currentInfamy,
                newInfamy: Math.min(1.0, currentInfamy + increase),
              },
              DIPLOMATIC_AI_SYSTEM_ID,
              sourceId as EntityId,
            );
          }

          // Only one war declaration per country per tick
          break;
        }
      }
    }
  }

  private evaluateCoalitions(
    state: Readonly<IWorldState>,
    eventBus: IEventBus,
  ): void {
    const countriesWithInfamy = state.getEntitiesByComponent(DIPLOMATIC_INFAMY_TYPE);
    const relationEntities = state.getEntitiesByComponent(DIPLOMATIC_RELATION_TYPE);

    // Build a lookup: countryId -> relations toward others
    const relationsBySource = new Map<string, RelationComponent[]>();
    for (const entity of relationEntities) {
      const rel = entity.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      if (!rel) continue;
      const list = relationsBySource.get(entity.id as string) ?? [];
      list.push(rel);
      relationsBySource.set(entity.id as string, list);
    }

    for (const entity of countriesWithInfamy) {
      const infamy = entity.getComponent<InfamyComponent>(DIPLOMATIC_INFAMY_TYPE);
      if (!infamy) continue;
      if (infamy.infamyScore < THRESHOLDS.COALITION_INFAMY_THRESHOLD) continue;

      // Gather candidate coalition members: all countries with relations toward the aggressor
      const candidates: { countryId: string; relation: RelationComponent; infamy: number }[] = [];
      for (const [sourceId, relations] of relationsBySource) {
        if (sourceId === entity.id as string) continue;
        const relTowardAggressor = relations.find(
          (r) => r.targetCountryId === entity.id,
        );
        if (!relTowardAggressor) continue;
        const candidateInfamy = this.getInfamy(state, sourceId);
        candidates.push({
          countryId: sourceId,
          relation: relTowardAggressor,
          infamy: candidateInfamy?.infamyScore ?? 0,
        });
      }

      const coalitionMembers = evaluateCoalitionMembership(
        entity.id as string,
        infamy.infamyScore,
        candidates,
      );

      if (coalitionMembers.length > 0) {
        const newMembers = coalitionMembers.filter(
          (m) => !infamy.coalitionMembers.includes(m),
        );
        if (newMembers.length > 0) {
          eventBus.publish<ICoalitionFormedPayload>(
            DIPLOMACY_COALITION_FORMED_EVENT,
            {
              aggressorId: entity.id as string,
              coalitionMembers: [...infamy.coalitionMembers, ...newMembers].filter(
                (v, i, a) => a.indexOf(v) === i,
              ),
              coalitionPurpose: 'punitive',
            },
            DIPLOMATIC_AI_SYSTEM_ID,
            entity.id as EntityId,
          );

          // Emit sanctions from coalition members
          eventBus.publish<ISanctionsAppliedPayload>(
            DIPLOMACY_SANCTIONS_APPLIED_EVENT,
            {
              aggressorId: entity.id as string,
              sanctioningCountries: newMembers,
              sanctionTypes: ['trade-embargo', 'swift-disconnect'],
            },
            DIPLOMATIC_AI_SYSTEM_ID,
            entity.id as EntityId,
          );
        }
      }
    }
  }

  private getInfamy(
    state: Readonly<IWorldState>,
    countryId: string,
  ): InfamyComponent | undefined {
    if (!state.hasEntity(countryId as EntityId)) return undefined;
    return state
      .getEntity(countryId as EntityId)
      ?.getComponent<InfamyComponent>(DIPLOMATIC_INFAMY_TYPE);
  }

  private getUnitsForCountry(
    allUnits: ReadonlyArray<IEntity>,
    countryId: string,
  ): MilitaryUnitComponent[] {
    return allUnits
      .map((e) => e.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE))
      .filter((m): m is MilitaryUnitComponent => m !== undefined && m.ownerCountryId === countryId);
  }
}
