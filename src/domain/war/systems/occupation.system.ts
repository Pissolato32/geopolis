import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { ITypedEvent } from '../../../core/interfaces/event-bus.interface.js';
import {
  WAR_COMBAT_RESOLVED_EVENT,
  WAR_PROVINCE_CAPTURED_EVENT,
  IWarCombatResolvedPayload,
  IWarProvinceCapturedPayload,
} from '../events/war.events.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../../diplomacy/components/relation.component.js';
import { PROVINCE_COMBAT_SYSTEM_ID } from './province-combat.system.js';

export const OCCUPATION_SYSTEM_ID = 'war.occupation';

const GEO_PROVINCE_TYPE = 'geo.province';

export class OccupationSystem implements ISystem {
  readonly descriptor = {
    id: OCCUPATION_SYSTEM_ID,
    name: 'Province Occupation System',
    priority: 470 as SystemPriority,
    requiredComponents: [],
    subscribedEvents: [WAR_COMBAT_RESOLVED_EVENT],
    emittedEvents: [WAR_PROVINCE_CAPTURED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IWarCombatResolvedPayload>(
      WAR_COMBAT_RESOLVED_EVENT,
      (event: ITypedEvent<IWarCombatResolvedPayload>) => {
        if (event.sourceSystem !== PROVINCE_COMBAT_SYSTEM_ID) return;
        if (!event.payload.eliminatedId) return;

        this.transferProvince(
          event.payload.provinceId,
          event.payload.eliminatedId,
          event.payload.victorId,
          worldState,
          eventBus,
        );
      },
    );
  }

  execute(): void {
  }

  private transferProvince(
    provinceId: string,
    eliminatedId: string,
    victorId: string,
    worldState: IWorldState,
    eventBus: IEventBus,
  ): void {
    const ws = worldState as unknown as {
      getEntityIds(): EntityId[];
      getEntity(id: EntityId): { getComponent(type: string): IComponent | undefined } | undefined;
      updateComponent(id: EntityId, comp: IComponent): void;
      addComponent(id: EntityId, comp: IComponent): void;
    };

    const eliminatedEntityId = eliminatedId as EntityId;
    const victorEntityId = victorId as EntityId;

    let provinceName = '';
    let found = false;

    for (const eid of ws.getEntityIds()) {
      const entity = ws.getEntity(eid);
      if (!entity) continue;
      const provComponent = entity.getComponent(GEO_PROVINCE_TYPE) as {
        provinces: Array<{ provinceId: string; provinceName: string }>;
      } | undefined;
      if (!provComponent) continue;

      const provIndex = provComponent.provinces.findIndex((p) => p.provinceId === provinceId);
      if (provIndex === -1) continue;

      provinceName = provComponent.provinces[provIndex]!.provinceName;
      const updatedProvinces = [...provComponent.provinces];
      const [removed] = updatedProvinces.splice(provIndex, 1);

      ws.updateComponent(eid, { type: GEO_PROVINCE_TYPE, provinces: updatedProvinces } as IComponent);

      const victorEntity = ws.getEntity(victorEntityId);
      const victorProvComponent = victorEntity?.getComponent(GEO_PROVINCE_TYPE) as {
        provinces: Array<{ provinceId: string; provinceName: string; lat: number; lng: number; neighborIds: string[]; resourceRich: boolean; ownerId: string }>;
      } | undefined;

      if (victorProvComponent) {
        ws.updateComponent(victorEntityId, {
          type: GEO_PROVINCE_TYPE,
          provinces: [...victorProvComponent.provinces, { ...removed, ownerId: victorId }],
        } as IComponent);
      } else {
        ws.addComponent(victorEntityId, {
          type: GEO_PROVINCE_TYPE,
          provinces: [{ ...removed, ownerId: victorId }],
        } as IComponent);
      }

      found = true;
      break;
    }

    if (!found) return;

    this.adjustRelations(eliminatedEntityId, victorEntityId, worldState);

    eventBus.publish<IWarProvinceCapturedPayload>(
      WAR_PROVINCE_CAPTURED_EVENT,
      {
        provinceId,
        provinceName,
        newOwnerId: victorId,
        oldOwnerId: eliminatedId,
      },
      OCCUPATION_SYSTEM_ID,
      victorEntityId,
    );
  }

  private adjustRelations(
    eliminatedId: EntityId,
    victorId: EntityId,
    worldState: IWorldState,
  ): void {
    const ws = worldState as unknown as {
      getEntityIds(): EntityId[];
      getEntity(id: EntityId): { getComponent(type: string): IComponent | undefined } | undefined;
      updateComponent(id: EntityId, comp: IComponent): void;
    };

    for (const eid of ws.getEntityIds()) {
      const entity = ws.getEntity(eid);
      if (!entity) continue;
      const rel = entity.getComponent(DIPLOMATIC_RELATION_TYPE) as RelationComponent | undefined;
      if (!rel) continue;

      if (rel.targetCountryId === eliminatedId || rel.targetCountryId === victorId) {
        const newAffinity = Math.max(-1, rel.affinity - 0.2);
        const newTension = Math.min(1, rel.tension + 0.15);

        ws.updateComponent(eid, {
          ...rel,
          affinity: Math.round(newAffinity * 100) / 100,
          tension: Math.round(newTension * 100) / 100,
        } as unknown as IComponent);
      }
    }
  }
}
