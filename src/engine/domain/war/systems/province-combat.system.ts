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
import { getTerrainModifiers, TerrainType } from '../components/terrain.components.js';
import {
  WAR_COMBAT_RESOLVED_EVENT,
  IWarCombatResolvedPayload,
} from '../events/war.events.js';
import {
  WAR_TERRAIN_BONUS_APPLIED_EVENT,
  IWarTerrainBonusPayload,
} from '../events/war-terrain.events.js';
import {
  RelationComponent,
} from '../../diplomacy/components/relation.component.js';
import { ITypedEvent } from '../../../core/interfaces/event-bus.interface.js';

export const PROVINCE_COMBAT_SYSTEM_ID = 'war.province-combat';

interface ProvinceUnitEntry {
  unitId: string;
  countryId: EntityId;
  personnel: number;
  power: number;
}

export class ProvinceCombatSystem implements ISystem {
  readonly descriptor = {
    id: PROVINCE_COMBAT_SYSTEM_ID,
    name: 'Province Combat Resolution System',
    priority: 460 as SystemPriority,
    requiredComponents: [MILITARY_UNIT_TYPE],
    subscribedEvents: [WAR_COMBAT_RESOLVED_EVENT],
    emittedEvents: [WAR_COMBAT_RESOLVED_EVENT],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IWarCombatResolvedPayload>(
      WAR_COMBAT_RESOLVED_EVENT,
      (event: ITypedEvent<IWarCombatResolvedPayload>) => {
        if (event.sourceSystem !== PROVINCE_COMBAT_SYSTEM_ID) return;
        this.applyCasualties(event.payload, worldState);
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
    const provinceUnits = new Map<string, ProvinceUnitEntry[]>();
    const provinceTerrain = this.buildProvinceTerrainMap(state);
    const provinceOwner = this.buildProvinceOwnerMap(state);

    for (const unit of units) {
      const mil = unit.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!mil) continue;
      if (mil.personnel <= 0) continue;

      const entries = provinceUnits.get(mil.currentProvinceId) ?? [];
      entries.push({
        unitId: unit.id,
        countryId: mil.ownerCountryId,
        personnel: mil.personnel,
        power: mil.personnel * mil.readiness * mil.morale,
      });
      provinceUnits.set(mil.currentProvinceId, entries);
    }

    for (const [provinceId, entries] of provinceUnits) {
      if (entries.length < 2) continue;

      const terrain = provinceTerrain.get(provinceId) ?? 'plains';
      const terrainMods = getTerrainModifiers(terrain);
      const provOwnerId = provinceOwner.get(provinceId);

      if (terrainMods.defenderBonus > 0 && provOwnerId) {
        eventBus.publish<IWarTerrainBonusPayload>(
          WAR_TERRAIN_BONUS_APPLIED_EVENT,
          { provinceId, terrain, defenderBonus: terrainMods.defenderBonus, defenderId: provOwnerId },
          PROVINCE_COMBAT_SYSTEM_ID, provOwnerId,
        );
      }

      const countryGroups = this.groupByCountry(entries);
      const countryIds = Array.from(countryGroups.keys());

      for (let i = 0; i < countryIds.length; i++) {
        for (let j = i + 1; j < countryIds.length; j++) {
          const aId = countryIds[i]!;
          const bId = countryIds[j]!;

          const rel = state.getRelation(aId, bId);
          if (!rel) continue;
          const relComp = rel as unknown as RelationComponent;
          if (relComp.affinity >= -0.3 || relComp.tension < 0.6) continue;

          const groupA = countryGroups.get(aId)!;
          const groupB = countryGroups.get(bId)!;
          let powerA = groupA.reduce((s, e) => s + e.power, 0);
          let powerB = groupB.reduce((s, e) => s + e.power, 0);

          if (provOwnerId === aId) powerA *= (1 + terrainMods.defenderBonus);
          if (provOwnerId === bId) powerB *= (1 + terrainMods.defenderBonus);

          const totalPower = powerA + powerB;
          if (totalPower <= 0) continue;

          const tick = state.getMetadata().currentTick;
          const roll = ((tick * 9301 + 49297) % 233280) / 233280;
          const aWinChance = powerA / totalPower;
          const victorId = roll < aWinChance ? aId : bId;

          const attackerGroup = victorId === aId ? groupA : groupB;
          const defenderGroup = victorId === aId ? groupB : groupA;
          const attackerPower = victorId === aId ? powerA : powerB;
          const defenderPower = victorId === aId ? powerB : powerA;

          const attackerPersonnel = attackerGroup.reduce((s, e) => s + e.personnel, 0);
          const defenderPersonnel = defenderGroup.reduce((s, e) => s + e.personnel, 0);

          let attackerCasualties = Math.round(defenderPower / totalPower * attackerPersonnel);
          let defenderCasualties = Math.round(attackerPower / totalPower * defenderPersonnel);

          attackerCasualties = Math.min(attackerCasualties, attackerPersonnel);
          defenderCasualties = Math.min(defenderCasualties, defenderPersonnel);

          const attackerEliminated = attackerCasualties >= attackerPersonnel;
          const defenderEliminated = defenderCasualties >= defenderPersonnel;
          const eliminatedId = victorId === aId
            ? (defenderEliminated ? bId : undefined)
            : (attackerEliminated ? aId : undefined);

          eventBus.publish<IWarCombatResolvedPayload>(
            WAR_COMBAT_RESOLVED_EVENT,
            {
              attackerId: aId,
              defenderId: bId,
              attackerCasualties,
              defenderCasualties,
              victorId,
              provinceId,
              eliminatedId,
            },
            PROVINCE_COMBAT_SYSTEM_ID,
            victorId,
          );

          break;
        }
        break;
      }
    }
  }

  private buildProvinceTerrainMap(state: Readonly<IWorldState>): Map<string, TerrainType> {
    const map = new Map<string, TerrainType>();
    for (const eid of state.getEntityIds()) {
      const entity = state.getEntity(eid);
      if (!entity) continue;
      const provComp = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
      if (!provComp) continue;
      for (const prov of provComp.provinces as ReadonlyArray<ProvinceData>) {
        map.set(prov.provinceId, prov.terrain);
      }
    }
    return map;
  }

  private buildProvinceOwnerMap(state: Readonly<IWorldState>): Map<string, EntityId> {
    const map = new Map<string, EntityId>();
    for (const eid of state.getEntityIds()) {
      const entity = state.getEntity(eid);
      if (!entity) continue;
      const provComp = entity.getComponent<ProvinceComponent>(PROVINCE_TYPE);
      if (!provComp) continue;
      for (const prov of provComp.provinces as ReadonlyArray<ProvinceData>) {
        map.set(prov.provinceId, prov.ownerId);
      }
    }
    return map;
  }

  private groupByCountry(entries: ProvinceUnitEntry[]): Map<EntityId, ProvinceUnitEntry[]> {
    const groups = new Map<EntityId, ProvinceUnitEntry[]>();
    for (const entry of entries) {
      const g = groups.get(entry.countryId) ?? [];
      g.push(entry);
      groups.set(entry.countryId, g);
    }
    return groups;
  }

  private applyCasualties(payload: IWarCombatResolvedPayload, worldState: IWorldState): void {
    const state = worldState as unknown as {
      getEntity(id: EntityId): { getComponent(type: string): IComponent | undefined } | undefined;
      updateComponent(id: EntityId, comp: IComponent): void;
      getEntityIds(): EntityId[];
    };

    const attackerId = payload.attackerId as EntityId;
    const defenderId = payload.defenderId as EntityId;

    const units: Array<{ id: EntityId; mil: MilitaryUnitComponent }> = [];
    for (const eid of state.getEntityIds()) {
      const entity = state.getEntity(eid);
      if (!entity) continue;
      const mil = entity.getComponent(MILITARY_UNIT_TYPE) as MilitaryUnitComponent | undefined;
      if (mil) units.push({ id: eid, mil });
    }

    const totalAttackerPersonnel = units
      .filter((e) => e.mil.ownerCountryId === attackerId)
      .reduce((s, e) => s + e.mil.personnel, 0);

    const totalDefenderPersonnel = units
      .filter((e) => e.mil.ownerCountryId === defenderId)
      .reduce((s, e) => s + e.mil.personnel, 0);

    for (const { id, mil } of units) {
      let reduction = 0;
      if (mil.ownerCountryId === attackerId && totalAttackerPersonnel > 0) {
        reduction = Math.round(payload.attackerCasualties * (mil.personnel / totalAttackerPersonnel));
      } else if (mil.ownerCountryId === defenderId && totalDefenderPersonnel > 0) {
        reduction = Math.round(payload.defenderCasualties * (mil.personnel / totalDefenderPersonnel));
      }

      if (reduction > 0) {
        state.updateComponent(id, {
          ...mil,
          personnel: Math.max(0, mil.personnel - reduction),
        } as unknown as IComponent);
      }
    }
  }
}
