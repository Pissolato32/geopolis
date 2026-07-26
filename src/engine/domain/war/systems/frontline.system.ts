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
  FRONTLINE_TYPE,
  FrontlineSegment,
} from '../components/province.components.js';
import { RelationComponent } from '../../diplomacy/components/relation.component.js';
import {
  WAR_FRONTLINE_SHIFTED_EVENT,
  IWarFrontlineShiftedPayload,
} from '../events/war-terrain.events.js';

export const FRONTLINE_SYSTEM_ID = 'war.frontline';

export class FrontlineSystem implements ISystem {
  readonly descriptor = {
    id: FRONTLINE_SYSTEM_ID,
    name: 'Dynamic Frontline System',
    priority: 453 as SystemPriority,
    requiredComponents: [MILITARY_UNIT_TYPE],
    subscribedEvents: [],
    emittedEvents: [WAR_FRONTLINE_SHIFTED_EVENT],
  };

  private eventBus!: IEventBus;
  private worldStateRef!: IWorldState;
  private lastSegments: Map<string, FrontlineSegment> = new Map();

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    this.eventBus = eventBus;
    if (worldState) this.worldStateRef = worldState as IWorldState;

    eventBus.subscribe<{ segments: FrontlineSegment[]; tick: number }>(
      'war.frontline-update',
      (event) => {
        const { segments, tick } = event.payload;
        const existing = this.worldStateRef.getEntityIds()
          .map((eid) => this.worldStateRef.getEntity(eid))
          .find((e) => e?.hasComponent(FRONTLINE_TYPE));

        if (existing) {
          this.worldStateRef.updateComponent(existing.id, {
            type: FRONTLINE_TYPE,
            segments,
            lastUpdatedTick: tick,
          } as unknown as IComponent);
        } else {
          this.worldStateRef.createEntity('frontline-global' as EntityId, [{
            type: FRONTLINE_TYPE,
            segments,
            lastUpdatedTick: tick,
          } as unknown as IComponent]);
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const tick = state.getMetadata().currentTick as number;
    const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);

    const provinceUnits = new Map<string, Map<EntityId, number>>();

    for (const unit of units) {
      const mil = unit.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!mil || mil.personnel <= 0) continue;
      const provUnits = provinceUnits.get(mil.currentProvinceId) ?? new Map<EntityId, number>();
      provUnits.set(mil.ownerCountryId, (provUnits.get(mil.ownerCountryId) ?? 0) + mil.personnel);
      provinceUnits.set(mil.currentProvinceId, provUnits);
    }

    const segments: FrontlineSegment[] = [];
    const segmentMap = new Map<string, FrontlineSegment>();

    for (const [provinceId, countryMap] of provinceUnits) {
      if (countryMap.size < 2) continue;
      const countries = Array.from(countryMap.keys());

      for (let i = 0; i < countries.length; i++) {
        for (let j = i + 1; j < countries.length; j++) {
          const a = countries[i]!;
          const b = countries[j]!;
          const relation = state.getRelation(a, b) as RelationComponent | undefined;
          if (!relation) continue;
          if (relation.affinity >= -0.3 || relation.tension < 0.6) continue;

          const powerA = countryMap.get(a)!;
          const powerB = countryMap.get(b)!;
          const intensity = Math.min(1.0, (powerA + powerB) / 50000);

          const segId = this.segmentKey(provinceId, a, b);
          const seg: FrontlineSegment = { provinceId, countryA: a, countryB: b, intensity };
          segments.push(seg);
          segmentMap.set(segId, seg);
        }
      }
    }

    const newSegmentIds = new Set(segmentMap.keys());
    const lostSegments: string[] = [];
    for (const [segId, oldSeg] of this.lastSegments) {
      if (!newSegmentIds.has(segId)) {
        lostSegments.push(oldSeg.provinceId);
      }
    }

    const changedPairs = new Map<string, { countryA: string; countryB: string; newSegs: { provinceId: string; intensity: number }[] }>();
    for (const [segId, seg] of segmentMap) {
      const old = this.lastSegments.get(segId);
      if (!old || old.intensity !== seg.intensity || old.provinceId !== seg.provinceId) {
        const pairKey = this.pairKey(seg.countryA, seg.countryB);
        const entry = changedPairs.get(pairKey) ?? { countryA: seg.countryA, countryB: seg.countryB, newSegs: [] as { provinceId: string; intensity: number }[] };
        entry.newSegs.push({ provinceId: seg.provinceId, intensity: seg.intensity });
        changedPairs.set(pairKey, entry);
      }
    }

    for (const [, entry] of changedPairs) {
      eventBus.publish<IWarFrontlineShiftedPayload>(
        WAR_FRONTLINE_SHIFTED_EVENT,
        { countryA: entry.countryA, countryB: entry.countryB, newSegments: entry.newSegs, lostSegments, tick },
        FRONTLINE_SYSTEM_ID,
      );
    }

    this.lastSegments = segmentMap;

    this.eventBus.publish(
      'war.frontline-update',
      { segments, tick },
      FRONTLINE_SYSTEM_ID,
    );
  }

  private segmentKey(provinceId: string, a: EntityId, b: EntityId): string {
    return `${provinceId}|${this.pairKey(a, b)}`;
  }

  private pairKey(a: EntityId, b: EntityId): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

}
