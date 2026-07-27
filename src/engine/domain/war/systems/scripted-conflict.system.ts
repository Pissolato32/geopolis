/**
 * Scripted conflict trigger — a debug system that forces a border conflict
 * between two specific countries on Tick 5. Used to verify the combat math
 * (morale/readiness multipliers) and to demonstrate the war.advantage-shifted
 * event on the frontend.
 *
 * Priority: 90 (runs before all domain systems so the conflict is registered
 * before combat resolution at priority 300).
 */

import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../components/war.components.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../../diplomacy/components/relation.component.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';

export const SCRIPTED_CONFLICT_SYSTEM_ID = 'debug.scripted-conflict';

const TRIGGER_TICK = 5;
const ATTACKER = 'RUS' as EntityId;
const DEFENDER = 'UKR' as EntityId;

export class ScriptedConflictSystem implements ISystem {
  readonly descriptor = {
    id: SCRIPTED_CONFLICT_SYSTEM_ID,
    name: 'Scripted Conflict Trigger (Debug)',
    priority: 90 as SystemPriority,
    requiredComponents: [],
    subscribedEvents: [],
    emittedEvents: ['war.declared', 'diplomacy.relation-updated'],
  };

  private fired = false;

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    if (this.fired) return;

    const tick = state.getMetadata().currentTick as unknown as number;
    if (tick < TRIGGER_TICK) return;

    this.fired = true;

    // Push tension to maximum on both sides' relation components
    for (const entityId of [ATTACKER, DEFENDER] as EntityId[]) {
      if (!state.hasEntity(entityId)) continue;
      const entity = state.getEntity(entityId);
      const rel = entity?.getComponent<RelationComponent>(DIPLOMATIC_RELATION_TYPE);
      if (rel) {
        const targetId = entityId === ATTACKER ? DEFENDER : ATTACKER;
        eventBus.publish(
          'diplomacy.relation-updated',
          {
            sourceEntityId: entityId,
            targetEntityId: targetId,
            affinity: -1.0,
            tension: 1.0,
            recognition: 'full',
            activeTreaties: [],
          },
          SCRIPTED_CONFLICT_SYSTEM_ID,
          entityId,
        );
      }
    }

    // Emit a war.declared event for the UI event log
    eventBus.publish(
      'war.declared',
      {
        aggressor: ATTACKER,
        target: DEFENDER,
        reason: 'Scripted border conflict (debug trigger — Tick 5)',
      },
      SCRIPTED_CONFLICT_SYSTEM_ID,
      ATTACKER,
    );

    // Boost attacker unit readiness to ensure combat triggers
    const attackerUnits = state.getEntitiesByComponent(MILITARY_UNIT_TYPE)
      .filter((e) => {
        const m = e.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
        return m?.ownerCountryId === ATTACKER;
      });

    for (const unit of attackerUnits) {
      const mil = unit.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (mil) {
        eventBus.publish(
          'war.unit-readiness-boosted',
          {
            unitId: unit.id,
            previousReadiness: mil.readiness,
            newReadiness: 0.95,
          },
          SCRIPTED_CONFLICT_SYSTEM_ID,
          unit.id as EntityId,
        );
      }
    }

    // Apply the readiness boost via relation update path
    const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
    for (const u of units) {
      const m = u.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (m?.ownerCountryId === ATTACKER) {
        state.updateComponent(u.id as EntityId, {
          ...m,
          readiness: 0.95,
          morale: 0.8,
          fuelReserves: 100,
        } as unknown as IComponent);
      }
    }
  }
}
