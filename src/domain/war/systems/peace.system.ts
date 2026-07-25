import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { ITypedEvent } from '../../../core/interfaces/event-bus.interface.js';
import {
  WAR_PEACE_REQUESTED_EVENT,
  WAR_PEACE_SIGNED_EVENT,
  IWarPeaceRequestedPayload,
  IWarPeaceSignedPayload,
} from '../events/war.events.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../../diplomacy/components/relation.component.js';

export const PEACE_SYSTEM_ID = 'war.peace';

const GEO_PROVINCE_TYPE = 'geo.province';

export class PeaceSystem implements ISystem {
  readonly descriptor = {
    id: PEACE_SYSTEM_ID,
    name: 'Peace Treaty System',
    priority: 490 as SystemPriority,
    requiredComponents: [],
    subscribedEvents: [WAR_PEACE_REQUESTED_EVENT],
    emittedEvents: [WAR_PEACE_SIGNED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IWarPeaceRequestedPayload>(
      WAR_PEACE_REQUESTED_EVENT,
      (event: ITypedEvent<IWarPeaceRequestedPayload>) => {
        this.processPeaceRequest(event.payload, worldState, eventBus);
      },
    );
  }

  execute(): void {
  }

  private processPeaceRequest(
    payload: IWarPeaceRequestedPayload,
    worldState: IWorldState,
    eventBus: IEventBus,
  ): void {
    const initiatorId = payload.initiator as EntityId;
    const targetId = payload.target as EntityId;

    const rel = worldState.getRelation(initiatorId, targetId);
    if (!rel) return;
    const relComponent = rel as unknown as RelationComponent;

    const accepted = this.evaluateAcceptance(relComponent, worldState);

    if (!accepted) return;

    const returnedProvinces: string[] = [];
    if (payload.returnProvinces) {
      for (const provinceId of payload.returnProvinces) {
        const transferred = this.transferProvinceTo(
          provinceId,
          initiatorId,
          worldState,
        );
        if (transferred) {
          returnedProvinces.push(provinceId);
        }
      }
    }

    const newAffinity = Math.min(0, relComponent.affinity + 0.1);
    const newTension = 0.2;

    this.updateBilateralRelations(initiatorId, targetId, newAffinity, newTension, worldState);

    eventBus.publish<IWarPeaceSignedPayload>(
      WAR_PEACE_SIGNED_EVENT,
      {
        initiator: payload.initiator,
        target: payload.target,
        returnedProvinces,
        newAffinity: Math.round(newAffinity * 100) / 100,
        newTension,
      },
      PEACE_SYSTEM_ID,
      initiatorId,
    );
  }

  private evaluateAcceptance(
    rel: RelationComponent,
    state: Readonly<IWorldState>,
  ): boolean {
    const baseChance = 0.5;
    const affinityBonus = (rel.affinity + 1) * 0.25;
    const tensionPenalty = rel.tension > 0.8 ? 0.2 : 0;
    const finalChance = Math.min(0.95, Math.max(0.1, baseChance + affinityBonus - tensionPenalty));

    const tick = state.getMetadata().currentTick;
    const roll = ((tick * 1664525 + 1013904223) >>> 0) % 1000 / 1000;

    return roll < finalChance;
  }

  private transferProvinceTo(
    provinceId: string,
    toCountryId: EntityId,
    worldState: IWorldState,
  ): boolean {
    const ws = worldState as unknown as {
      getEntityIds(): EntityId[];
      getEntity(id: EntityId): { getComponent(type: string): IComponent | undefined } | undefined;
      updateComponent(id: EntityId, comp: IComponent): void;
      addComponent(id: EntityId, comp: IComponent): void;
    };

    for (const eid of ws.getEntityIds()) {
      const entity = ws.getEntity(eid);
      if (!entity) continue;
      const provComponent = entity.getComponent(GEO_PROVINCE_TYPE) as {
        provinces: Array<{ provinceId: string; provinceName: string; lat: number; lng: number; neighborIds: string[]; resourceRich: boolean; ownerId: string }>;
      } | undefined;
      if (!provComponent) continue;

      const provIndex = provComponent.provinces.findIndex((p) => p.provinceId === provinceId);
      if (provIndex === -1) continue;

      const [removed] = provComponent.provinces.splice(provIndex, 1);
      ws.updateComponent(eid, { type: GEO_PROVINCE_TYPE, provinces: provComponent.provinces } as IComponent);

      const targetEntity = ws.getEntity(toCountryId);
      const targetProvComponent = targetEntity?.getComponent(GEO_PROVINCE_TYPE) as {
        provinces: Array<{ provinceId: string; provinceName: string; lat: number; lng: number; neighborIds: string[]; resourceRich: boolean; ownerId: string }>;
      } | undefined;

      if (targetProvComponent) {
        ws.updateComponent(toCountryId, {
          type: GEO_PROVINCE_TYPE,
          provinces: [...targetProvComponent.provinces, { ...removed, ownerId: toCountryId }],
        } as IComponent);
      } else {
        ws.addComponent(toCountryId, {
          type: GEO_PROVINCE_TYPE,
          provinces: [{ ...removed, ownerId: toCountryId }],
        } as IComponent);
      }

      return true;
    }

    return false;
  }

  private updateBilateralRelations(
    countryA: EntityId,
    countryB: EntityId,
    newAffinity: number,
    newTension: number,
    worldState: IWorldState,
  ): void {
    const ws = worldState as unknown as {
      getEntityIds(): EntityId[];
      getEntity(id: EntityId): { getComponent(type: string): IComponent | undefined } | undefined;
      updateComponent(id: EntityId, comp: IComponent): void;
    };

    const updated = new Set<string>();

    for (const eid of ws.getEntityIds()) {
      const entity = ws.getEntity(eid);
      if (!entity) continue;
      const rel = entity.getComponent(DIPLOMATIC_RELATION_TYPE) as RelationComponent | undefined;
      if (!rel) continue;
      if (rel.targetCountryId !== countryA && rel.targetCountryId !== countryB) continue;

      const pairKey = eid < rel.targetCountryId ? `${eid}:${rel.targetCountryId}` : `${rel.targetCountryId}:${eid}`;
      if (updated.has(pairKey)) continue;
      updated.add(pairKey);

      if ((eid === countryA && rel.targetCountryId === countryB) ||
          (eid === countryB && rel.targetCountryId === countryA)) {
        ws.updateComponent(eid, {
          ...rel,
          affinity: newAffinity,
          tension: newTension,
        } as unknown as IComponent);
      }
    }
  }
}
