import { MILITARY_UNIT_TYPE, } from '../components/war.components.js';
import { WAR_COMBAT_RESOLVED_EVENT, } from '../events/war.events.js';
export const COMBAT_SYSTEM_ID = 'war.combat';
export class CombatSystem {
    descriptor = {
        id: COMBAT_SYSTEM_ID,
        name: 'Combat Resolution System',
        priority: 450,
        requiredComponents: [MILITARY_UNIT_TYPE],
        subscribedEvents: [],
        emittedEvents: [WAR_COMBAT_RESOLVED_EVENT],
    };
    execute(state, eventBus) {
        const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
        const countryUnits = new Map();
        for (const unitEntity of units) {
            const mil = unitEntity.getComponent(MILITARY_UNIT_TYPE);
            if (!mil)
                continue;
            if (mil.fuelReserves <= 0 || mil.readiness < 0.2)
                continue;
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
        const resolvedPairs = new Set();
        for (let i = 0; i < countryIds.length; i++) {
            for (let j = i + 1; j < countryIds.length; j++) {
                const aId = countryIds[i];
                const bId = countryIds[j];
                const pairKey = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
                if (resolvedPairs.has(pairKey))
                    continue;
                const relA = state.getRelation(aId, bId);
                if (!relA)
                    continue;
                const relComponent = relA;
                if (relComponent.affinity >= -0.3 || relComponent.tension < 0.6)
                    continue;
                resolvedPairs.add(pairKey);
                const groupA = countryUnits.get(aId);
                const groupB = countryUnits.get(bId);
                const totalPower = groupA.totalPower + groupB.totalPower;
                if (totalPower === 0)
                    continue;
                const winRoll = Math.random();
                const aWinChance = groupA.totalPower / totalPower;
                const victorId = winRoll < aWinChance ? aId : bId;
                const attackerGroup = victorId === aId ? groupA : groupB;
                const defenderGroup = victorId === aId ? groupB : groupA;
                const attackerCasualties = Math.round(defenderGroup.totalPower / totalPower * 1000);
                const defenderCasualties = Math.round(attackerGroup.totalPower / totalPower * 1000);
                eventBus.publish(WAR_COMBAT_RESOLVED_EVENT, {
                    attackerId: attackerGroup.countryId,
                    defenderId: defenderGroup.countryId,
                    attackerCasualties,
                    defenderCasualties,
                    victorId,
                    provinceId: '',
                    eliminatedId: undefined,
                }, COMBAT_SYSTEM_ID, victorId);
            }
        }
    }
}
//# sourceMappingURL=combat.system.js.map