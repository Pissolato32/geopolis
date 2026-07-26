import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../components/war.components.js';
import {
  PROVINCE_TYPE,
  ProvinceComponent,
  ProvinceData,
} from '../components/province.components.js';
import {
  WAR_OCCUPATION_PROGRESS_EVENT,
  WAR_PROVINCE_CONTESTED_EVENT,
  IWarOccupationProgressPayload,
  IWarProvinceContestedPayload,
} from '../events/war-terrain.events.js';
import { WAR_COMBAT_RESOLVED_EVENT, IWarProvinceCapturedPayload, WAR_PROVINCE_CAPTURED_EVENT } from '../events/war.events.js';

export const OCCUPATION_PROGRESS_SYSTEM_ID = 'war.occupation-progress';

const OCCUPATION_RATE = 25;
const RESISTANCE_DECAY_RATE = 10;
const GARRISON_THRESHOLD = 2000;

export class OccupationProgressSystem implements ISystem {
  readonly descriptor = {
    id: OCCUPATION_PROGRESS_SYSTEM_ID,
    name: 'Gradual Occupation Progress System',
    priority: 472 as SystemPriority,
    requiredComponents: [MILITARY_UNIT_TYPE],
    subscribedEvents: [WAR_COMBAT_RESOLVED_EVENT],
    emittedEvents: [WAR_OCCUPATION_PROGRESS_EVENT, WAR_PROVINCE_CONTESTED_EVENT, WAR_PROVINCE_CAPTURED_EVENT],
  };

  private eventBus!: IEventBus;
  private worldStateRef!: IWorldState;

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    this.eventBus = eventBus;
    if (worldState) this.worldStateRef = worldState as IWorldState;

    eventBus.subscribe<{ ownerId: string; provinceId: string; province: ProvinceData }>(
      'war.province-updated',
      (event) => {
        const { ownerId, provinceId, province } = event.payload;
        this.applyProvinceUpdate(ownerId as EntityId, provinceId, province);
      },
    );

    eventBus.subscribe<{ fromOwner: string; toOwner: string; province: ProvinceData }>(
      'war.province-transferred',
      (event) => {
        const { fromOwner, toOwner, province } = event.payload;
        this.applyTransfer(fromOwner as EntityId, toOwner as EntityId, province);
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
    const provincesByOwner = this.buildProvinceMap(state);

    const provinceGarrisons = new Map<string, Map<EntityId, number>>();
    for (const unit of units) {
      const mil = unit.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!mil || mil.personnel <= 0) continue;
      const garrisons = provinceGarrisons.get(mil.currentProvinceId) ?? new Map<EntityId, number>();
      garrisons.set(mil.ownerCountryId, (garrisons.get(mil.ownerCountryId) ?? 0) + mil.personnel);
      provinceGarrisons.set(mil.currentProvinceId, garrisons);
    }

    for (const [ownerId, provinces] of provincesByOwner) {
      for (const prov of provinces) {
        const garrisons = provinceGarrisons.get(prov.provinceId);

        if (prov.occupationProgress > 0 && prov.occupyingCountryId) {
          const occupierGarrison = garrisons?.get(prov.occupyingCountryId) ?? 0;
          const ownerGarrison = garrisons?.get(prov.ownerId) ?? 0;

          if (occupierGarrison >= GARRISON_THRESHOLD && ownerGarrison < occupierGarrison) {
            const newProgress = Math.min(100, prov.occupationProgress + OCCUPATION_RATE);
            const completed = newProgress >= 100;

            this.eventBus.publish(
              'war.province-updated',
              { ownerId, provinceId: prov.provinceId, province: { ...prov, occupationProgress: newProgress } },
              OCCUPATION_PROGRESS_SYSTEM_ID, prov.occupyingCountryId,
            );

            eventBus.publish<IWarOccupationProgressPayload>(
              WAR_OCCUPATION_PROGRESS_EVENT,
              { provinceId: prov.provinceId, provinceName: prov.provinceName, occupyingCountryId: prov.occupyingCountryId, progress: newProgress, completed },
              OCCUPATION_PROGRESS_SYSTEM_ID, prov.occupyingCountryId,
            );

            if (completed) {
              this.eventBus.publish(
                'war.province-transferred',
                { fromOwner: ownerId, toOwner: prov.occupyingCountryId, province: prov },
                OCCUPATION_PROGRESS_SYSTEM_ID, prov.occupyingCountryId,
              );
              eventBus.publish<IWarProvinceCapturedPayload>(
                WAR_PROVINCE_CAPTURED_EVENT,
                { provinceId: prov.provinceId, provinceName: prov.provinceName, newOwnerId: prov.occupyingCountryId, oldOwnerId: ownerId },
                OCCUPATION_PROGRESS_SYSTEM_ID, prov.occupyingCountryId,
              );
            }
          } else if (ownerGarrison > occupierGarrison) {
            const newProgress = Math.max(0, prov.occupationProgress - RESISTANCE_DECAY_RATE);
            if (newProgress === 0) {
              this.eventBus.publish(
                'war.province-updated',
                { ownerId, provinceId: prov.provinceId, province: { ...prov, occupationProgress: 0, occupyingCountryId: undefined } },
                OCCUPATION_PROGRESS_SYSTEM_ID, prov.occupyingCountryId,
              );
            } else {
              this.eventBus.publish(
                'war.province-updated',
                { ownerId, provinceId: prov.provinceId, province: { ...prov, occupationProgress: newProgress } },
                OCCUPATION_PROGRESS_SYSTEM_ID, prov.occupyingCountryId,
              );
            }
          }
        }

        if (!prov.occupyingCountryId && garrisons) {
          for (const [countryId, personnel] of garrisons) {
            if (countryId !== prov.ownerId && personnel >= GARRISON_THRESHOLD) {
              eventBus.publish<IWarProvinceContestedPayload>(
                WAR_PROVINCE_CONTESTED_EVENT,
                { provinceId: prov.provinceId, provinceName: prov.provinceName, countryA: prov.ownerId, countryB: countryId },
                OCCUPATION_PROGRESS_SYSTEM_ID, countryId,
              );

              this.eventBus.publish(
                'war.province-updated',
                { ownerId: prov.ownerId, provinceId: prov.provinceId, province: { ...prov, occupationProgress: OCCUPATION_RATE, occupyingCountryId: countryId } },
                OCCUPATION_PROGRESS_SYSTEM_ID, countryId,
              );

              eventBus.publish<IWarOccupationProgressPayload>(
                WAR_OCCUPATION_PROGRESS_EVENT,
                { provinceId: prov.provinceId, provinceName: prov.provinceName, occupyingCountryId: countryId, progress: OCCUPATION_RATE, completed: false },
                OCCUPATION_PROGRESS_SYSTEM_ID, countryId,
              );
              break;
            }
          }
        }
      }
    }
  }

  private buildProvinceMap(state: Readonly<IWorldState>): Map<EntityId, ProvinceData[]> {
    const map = new Map<EntityId, ProvinceData[]>();
    for (const eid of state.getEntityIds()) {
      const entity = state.getEntity(eid);
      if (!entity) continue;
      const provComp = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
      if (!provComp) continue;
      for (const prov of provComp.provinces as ReadonlyArray<ProvinceData>) {
        const list = map.get(prov.ownerId) ?? [];
        list.push(prov);
        map.set(prov.ownerId, list);
      }
    }
    return map;
  }

  private applyProvinceUpdate(ownerId: EntityId, provinceId: string, newProv: ProvinceData): void {
    const entity = this.worldStateRef.getEntity(ownerId);
    if (!entity) return;
    const provComp = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
    if (!provComp) return;
    const newProvinces = (provComp.provinces as ReadonlyArray<ProvinceData>).map((p) =>
      p.provinceId === provinceId ? newProv : p,
    );
    this.worldStateRef.updateComponent(ownerId, {
      ...provComp,
      provinces: newProvinces,
    } as unknown as IComponent);
  }

  private applyTransfer(fromOwner: EntityId, toOwner: EntityId, prov: ProvinceData): void {
    const fromEntity = this.worldStateRef.getEntity(fromOwner);
    if (fromEntity) {
      const fromComp = fromEntity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
      if (fromComp) {
        const remaining = (fromComp.provinces as ReadonlyArray<ProvinceData>).filter((p) => p.provinceId !== prov.provinceId);
        this.worldStateRef.updateComponent(fromOwner, { ...fromComp, provinces: remaining } as unknown as IComponent);
      }
    }

    const toEntity = this.worldStateRef.getEntity(toOwner);
    if (toEntity) {
      const toComp = toEntity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
      if (toComp) {
        const updated = [...(toComp.provinces as ReadonlyArray<ProvinceData>), { ...prov, ownerId: toOwner, occupationProgress: 0, occupyingCountryId: undefined }];
        this.worldStateRef.updateComponent(toOwner, { ...toComp, provinces: updated } as unknown as IComponent);
      } else {
        this.worldStateRef.addComponent(toOwner, {
          type: PROVINCE_TYPE,
          provinces: [{ ...prov, ownerId: toOwner, occupationProgress: 0, occupyingCountryId: undefined }],
        } as unknown as IComponent);
      }
    }
  }
}
