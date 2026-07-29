import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  MILITARY_DETAIL_TYPE,
  CountryMilitaryDetailComponent,
} from '../components/military-detail.component.js';
import {
  WAR_COMBAT_RESOLVED_EVENT,
  WAR_CASUALTIES_TAKEN_EVENT,
  WAR_EXHAUSTION_INCREASED_EVENT,
  WAR_ADVANTAGE_SHIFTED_EVENT,
  IWarCombatResolvedPayload,
  IWarCasualtiesTakenPayload,
  IWarExhaustionIncreasedPayload,
  IWarAdvantageShiftedPayload,
} from '../events/war.events.js';
import { resolveCombat } from './combined-arms.js';
import {
  RelationComponent,
} from '../../diplomacy/components/relation.component.js';
import {
  WAR_EXHAUSTION_TYPE,
  WarExhaustionComponent,
} from '../../politics/components/war-exhaustion.component.js';

export const COMBINED_ARMS_COMBAT_SYSTEM_ID = 'war.combat.combined-arms';

/**
 * CombatSystem — Combined Arms Edition.
 *
 * Reads CountryMilitaryDetailComponent from belligerents, calculates combat
 * outcomes using the combined-arms formula (logistics as sustainment multiplier,
 * airpower as force multiplier), and emits typed events. Does NOT mutate state
 * directly — all state changes flow through the EventBus.
 */
export class CombinedArmsCombatSystem implements ISystem {
  readonly descriptor = {
    id: COMBINED_ARMS_COMBAT_SYSTEM_ID,
    name: 'Combat Resolution System (Combined Arms)',
    priority: 450 as SystemPriority,
    requiredComponents: [MILITARY_DETAIL_TYPE],
    subscribedEvents: [],
    emittedEvents: [
      WAR_COMBAT_RESOLVED_EVENT,
      WAR_CASUALTIES_TAKEN_EVENT,
      WAR_EXHAUSTION_INCREASED_EVENT,
      WAR_ADVANTAGE_SHIFTED_EVENT,
    ],
  };

  /** Tracks cumulative casualties per country (in-memory between ticks) */
  private cumulativeCasualties: Map<string, number> = new Map();
  /** Tracks current exhaustion per country (mirrored from components) */
  private exhaustionState: Map<string, number> = new Map();

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    // Subscribe to exhaustion-increased events to update the mirrored state
    eventBus.subscribe<IWarExhaustionIncreasedPayload>(
      WAR_EXHAUSTION_INCREASED_EVENT,
      (event) => {
        const countryId = event.payload.countryId;
        if (worldState.hasEntity(countryId as EntityId)) {
          const entity = worldState.getEntity(countryId as EntityId);
          const current = entity?.getComponent<WarExhaustionComponent>(WAR_EXHAUSTION_TYPE);
          if (current) {
            worldState.updateComponent(countryId as EntityId, {
              ...current,
              exhaustion: event.payload.newExhaustion,
              accumulatedCasualties: this.cumulativeCasualties.get(countryId) ?? current.accumulatedCasualties,
              ticksAtWar: current.ticksAtWar + 1,
            } as unknown as IComponent);
          }
          this.exhaustionState.set(countryId, event.payload.newExhaustion);
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const countries = state.getEntitiesByComponent(MILITARY_DETAIL_TYPE);
    if (countries.length < 2) return;

    // Sync exhaustion state from components
    for (const country of countries) {
      const exhaustion = country.getComponent<WarExhaustionComponent>(WAR_EXHAUSTION_TYPE);
      if (exhaustion) {
        this.exhaustionState.set(country.id, exhaustion.exhaustion);
      }
    }

    const resolvedPairs = new Set<string>();

    for (let i = 0; i < countries.length; i++) {
      for (let j = i + 1; j < countries.length; j++) {
        const aId = countries[i]!.id;
        const bId = countries[j]!.id;
        const pairKey = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
        if (resolvedPairs.has(pairKey)) continue;

        // Check diplomatic relation — only fight if hostile
        const relA = state.getRelation(aId as EntityId, bId as EntityId);
        if (!relA) continue;
        const relComponent = relA as unknown as RelationComponent;
        if (relComponent.affinity >= -0.3 || relComponent.tension < 0.6) continue;

        resolvedPairs.add(pairKey);

        const aDetail = countries[i]!.getComponent<CountryMilitaryDetailComponent>(MILITARY_DETAIL_TYPE);
        const bDetail = countries[j]!.getComponent<CountryMilitaryDetailComponent>(MILITARY_DETAIL_TYPE);
        if (!aDetail || !bDetail) continue;

        const outcome = resolveCombat(aId, bId, aDetail, bDetail);

        // 1. Emit advantage-shifted event (before combat resolution)
        eventBus.publish<IWarAdvantageShiftedPayload>(
          WAR_ADVANTAGE_SHIFTED_EVENT,
          {
            attackerId: outcome.attackerId,
            defenderId: outcome.defenderId,
            attackerPower: outcome.attackerPower,
            defenderPower: outcome.defenderPower,
            attackerAdvantagePct: outcome.attackerAdvantagePct,
            defenderAdvantagePct: outcome.defenderAdvantagePct,
            momentum: outcome.momentum,
          },
          COMBINED_ARMS_COMBAT_SYSTEM_ID,
        );

        // 2. Emit combat resolved event
        eventBus.publish<IWarCombatResolvedPayload>(
          WAR_COMBAT_RESOLVED_EVENT,
          {
            attackerId: outcome.attackerId,
            defenderId: outcome.defenderId,
            attackerCasualties: outcome.attackerCasualties,
            defenderCasualties: outcome.defenderCasualties,
            victorId: outcome.victorId,
            provinceId: '',
            eliminatedId: undefined,
          },
          COMBINED_ARMS_COMBAT_SYSTEM_ID,
          outcome.victorId as EntityId,
        );

        // 3. Emit casualties-taken events for both sides
        this.emitCasualties(eventBus, outcome.attackerId, outcome.attackerCasualties);
        this.emitCasualties(eventBus, outcome.defenderId, outcome.defenderCasualties);

        // 4. Emit exhaustion-increased events for both sides
        this.emitExhaustion(eventBus, outcome.attackerId, outcome.attackerExhaustionDelta);
        this.emitExhaustion(eventBus, outcome.defenderId, outcome.defenderExhaustionDelta);
      }
    }
  }

  private emitCasualties(eventBus: IEventBus, countryId: string, casualties: number): void {
    if (casualties <= 0) return;
    const cumulative = (this.cumulativeCasualties.get(countryId) ?? 0) + casualties;
    this.cumulativeCasualties.set(countryId, cumulative);

    eventBus.publish<IWarCasualtiesTakenPayload>(
      WAR_CASUALTIES_TAKEN_EVENT,
      {
        countryId,
        casualties,
        cumulativeCasualties: cumulative,
      },
      COMBINED_ARMS_COMBAT_SYSTEM_ID,
      countryId as EntityId,
    );
  }

  private emitExhaustion(eventBus: IEventBus, countryId: string, delta: number): void {
    if (delta <= 0) return;
    const previous = this.exhaustionState.get(countryId) ?? 0;
    const newExhaustion = Math.min(100, previous + delta);
    this.exhaustionState.set(countryId, newExhaustion);

    eventBus.publish<IWarExhaustionIncreasedPayload>(
      WAR_EXHAUSTION_INCREASED_EVENT,
      {
        countryId,
        previousExhaustion: previous,
        newExhaustion,
        delta,
      },
      COMBINED_ARMS_COMBAT_SYSTEM_ID,
      countryId as EntityId,
    );
  }
}
