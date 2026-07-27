import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  MILITARY_UNIT_TYPE,
  MilitaryUnitComponent,
} from '../components/war.components.js';
import {
  WAR_COMBAT_RESOLVED_EVENT,
  IWarCombatResolvedPayload,
  WAR_ADVANTAGE_SHIFTED_EVENT,
  IWarAdvantageShiftedPayload,
} from '../events/war.events.js';
import {
  RelationComponent,
} from '../../diplomacy/components/relation.component.js';

export const COMBAT_SYSTEM_ID = 'war.combat';

interface UnitGroup {
  countryId: EntityId;
  units: MilitaryUnitComponent[];
  totalPower: number;
}

export class CombatSystem implements ISystem {
  readonly descriptor = {
    id: COMBAT_SYSTEM_ID,
    name: 'Combat Resolution System',
    priority: 450 as SystemPriority,
    requiredComponents: [MILITARY_UNIT_TYPE],
    subscribedEvents: [],
    emittedEvents: [WAR_COMBAT_RESOLVED_EVENT, WAR_ADVANTAGE_SHIFTED_EVENT],
  };

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);

    const countryUnits = new Map<string, UnitGroup>();

    for (const unitEntity of units) {
      const mil = unitEntity.getComponent<MilitaryUnitComponent>(MILITARY_UNIT_TYPE);
      if (!mil) continue;
      if (mil.fuelReserves <= 0 || mil.readiness < 0.2) continue;

      const cid = mil.ownerCountryId;
      let group = countryUnits.get(cid);
      if (!group) {
        group = { countryId: cid, units: [], totalPower: 0 };
        countryUnits.set(cid, group);
      }
      group.units.push(mil);
      group.totalPower += mil.personnel * mil.readiness * mil.morale;
    }

    const countryIds = Array.from(countryUnits.keys());
    const resolvedPairs = new Set<string>();

    for (let i = 0; i < countryIds.length; i++) {
      for (let j = i + 1; j < countryIds.length; j++) {
        const aId = countryIds[i]!;
        const bId = countryIds[j]!;
        const pairKey = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
        if (resolvedPairs.has(pairKey)) continue;

        const relA = state.getRelation(aId as EntityId, bId as EntityId);
        if (!relA) continue;
        const relComponent = relA as unknown as RelationComponent;
        if (relComponent.affinity >= -0.3 || relComponent.tension < 0.6) continue;

        resolvedPairs.add(pairKey);

        const groupA = countryUnits.get(aId)!;
        const groupB = countryUnits.get(bId)!;
        const totalPower = groupA.totalPower + groupB.totalPower;
        if (totalPower === 0) continue;

        const winRoll = Math.random();
        const aWinChance = groupA.totalPower / totalPower;
        const victorId = winRoll < aWinChance ? aId : bId;

        const attackerGroup = victorId === aId ? groupA : groupB;
        const defenderGroup = victorId === aId ? groupB : groupA;

        // Emit advantage-shifted BEFORE casualties are applied, so the UI can
        // visualize the pre-casualty balance of power.
        const attackerAdvantagePct = Math.round((attackerGroup.totalPower / totalPower) * 1000) / 10;
        const defenderAdvantagePct = Math.round((defenderGroup.totalPower / totalPower) * 1000) / 10;
        const momentum = Math.max(-1, Math.min(1, (attackerGroup.totalPower - defenderGroup.totalPower) / totalPower));

        eventBus.publish<IWarAdvantageShiftedPayload>(
          WAR_ADVANTAGE_SHIFTED_EVENT,
          {
            attackerId: attackerGroup.countryId,
            defenderId: defenderGroup.countryId,
            momentum,
            attackerAdvantagePct,
            defenderAdvantagePct,
          },
          COMBAT_SYSTEM_ID,
          attackerGroup.countryId as EntityId,
        );

        const attackerCasualties = Math.round(defenderGroup.totalPower / totalPower * 1000);
        const defenderCasualties = Math.round(attackerGroup.totalPower / totalPower * 1000);

        eventBus.publish<IWarCombatResolvedPayload>(
          WAR_COMBAT_RESOLVED_EVENT,
          {
            attackerId: attackerGroup.countryId,
            defenderId: defenderGroup.countryId,
            attackerCasualties,
            defenderCasualties,
            victorId,
            provinceId: '',
            eliminatedId: undefined,
          },
          COMBAT_SYSTEM_ID,
          victorId as EntityId,
        );
      }
    }
  }
}
