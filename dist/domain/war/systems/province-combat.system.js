import { MILITARY_UNIT_TYPE, } from '../components/war.components.js';
import { WAR_COMBAT_RESOLVED_EVENT, } from '../events/war.events.js';
export const PROVINCE_COMBAT_SYSTEM_ID = 'war.province-combat';
export class ProvinceCombatSystem {
    descriptor = {
        id: PROVINCE_COMBAT_SYSTEM_ID,
        name: 'Province Combat Resolution System',
        priority: 460,
        requiredComponents: [MILITARY_UNIT_TYPE],
        subscribedEvents: [WAR_COMBAT_RESOLVED_EVENT],
        emittedEvents: [WAR_COMBAT_RESOLVED_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(WAR_COMBAT_RESOLVED_EVENT, (event) => {
            if (event.sourceSystem !== PROVINCE_COMBAT_SYSTEM_ID)
                return;
            this.applyCasualties(event.payload, worldState);
        });
    }
    execute(state, eventBus) {
        const units = state.getEntitiesByComponent(MILITARY_UNIT_TYPE);
        const provinceUnits = new Map();
        for (const unit of units) {
            const mil = unit.getComponent(MILITARY_UNIT_TYPE);
            if (!mil)
                continue;
            if (mil.personnel <= 0)
                continue;
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
            if (entries.length < 2)
                continue;
            const countryGroups = this.groupByCountry(entries);
            const countryIds = Array.from(countryGroups.keys());
            for (let i = 0; i < countryIds.length; i++) {
                for (let j = i + 1; j < countryIds.length; j++) {
                    const aId = countryIds[i];
                    const bId = countryIds[j];
                    const rel = state.getRelation(aId, bId);
                    if (!rel)
                        continue;
                    const relComp = rel;
                    if (relComp.affinity >= -0.3 || relComp.tension < 0.6)
                        continue;
                    const groupA = countryGroups.get(aId);
                    const groupB = countryGroups.get(bId);
                    const powerA = groupA.reduce((s, e) => s + e.power, 0);
                    const powerB = groupB.reduce((s, e) => s + e.power, 0);
                    const totalPower = powerA + powerB;
                    if (totalPower <= 0)
                        continue;
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
                    eventBus.publish(WAR_COMBAT_RESOLVED_EVENT, {
                        attackerId: aId,
                        defenderId: bId,
                        attackerCasualties,
                        defenderCasualties,
                        victorId,
                        provinceId,
                        eliminatedId,
                    }, PROVINCE_COMBAT_SYSTEM_ID, victorId);
                    break;
                }
                break;
            }
        }
    }
    groupByCountry(entries) {
        const groups = new Map();
        for (const entry of entries) {
            const g = groups.get(entry.countryId) ?? [];
            g.push(entry);
            groups.set(entry.countryId, g);
        }
        return groups;
    }
    applyCasualties(payload, worldState) {
        const state = worldState;
        const attackerId = payload.attackerId;
        const defenderId = payload.defenderId;
        const units = [];
        for (const eid of state.getEntityIds()) {
            const entity = state.getEntity(eid);
            if (!entity)
                continue;
            const mil = entity.getComponent(MILITARY_UNIT_TYPE);
            if (mil)
                units.push({ id: eid, mil });
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
            }
            else if (mil.ownerCountryId === defenderId && totalDefenderPersonnel > 0) {
                reduction = Math.round(payload.defenderCasualties * (mil.personnel / totalDefenderPersonnel));
            }
            if (reduction > 0) {
                state.updateComponent(id, {
                    ...mil,
                    personnel: Math.max(0, mil.personnel - reduction),
                });
            }
        }
    }
}
//# sourceMappingURL=province-combat.system.js.map