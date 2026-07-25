import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../components/war.components.js';
import {
  WAR_FUEL_CONSUMED_EVENT,
  WAR_FUEL_DEPLETED_EVENT,
  IWarFuelConsumedPayload,
  IWarFuelDepletedPayload,
} from '../events/war.events.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';

export const WAR_SYSTEM_ID = 'war.system';

/**
 * ECS System responsible for military unit maintenance, fuel consumption, and combat readiness per tick.
 * Priority: 500 (executes after diplomacy).
 */
export class WarSystem implements ISystem {
  readonly descriptor = {
    id: WAR_SYSTEM_ID,
    name: 'Military & Logistics System',
    priority: 500 as SystemPriority,
    requiredComponents: [MILITARY_UNIT_TYPE],
    subscribedEvents: [WAR_FUEL_CONSUMED_EVENT],
    emittedEvents: [WAR_FUEL_CONSUMED_EVENT, WAR_FUEL_DEPLETED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;
    eventBus.subscribe<IWarFuelConsumedPayload>(
      WAR_FUEL_CONSUMED_EVENT,
      (event) => {
        const unitId = event.payload.unitId as EntityId;
        if (worldState.hasEntity(unitId)) {
          const entity = worldState.getEntity(unitId);
          const currentComp = entity?.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
          if (currentComp) {
            worldState.updateComponent(unitId, {
              ...currentComp,
              fuelReserves: event.payload.newFuel,
            } as unknown as IComponent);
          }
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);

    for (const unit of units) {
      const militaryComp = unit.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!militaryComp) continue;

      const newFuel = Math.max(0, militaryComp.fuelReserves - 2);

      // Publish event for event resolution phase (no direct state mutation in execute)
      eventBus.publish<IWarFuelConsumedPayload>(
        WAR_FUEL_CONSUMED_EVENT,
        {
          unitId: unit.id,
          previousFuel: militaryComp.fuelReserves,
          newFuel,
        },
        WAR_SYSTEM_ID,
        unit.id,
      );

      if (newFuel === 0) {
        eventBus.publish<IWarFuelDepletedPayload>(
          WAR_FUEL_DEPLETED_EVENT,
          {
            unitId: unit.id,
            remainingFuel: 0,
            readinessPenalty: 0.1,
          },
          WAR_SYSTEM_ID,
          unit.id,
        );
      }
    }
  }
}
