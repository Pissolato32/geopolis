import { WAR_PEACE_REQUESTED_EVENT, WAR_PEACE_SIGNED_EVENT, } from '../events/war.events.js';
import { DIPLOMATIC_RELATION_TYPE, } from '../../diplomacy/components/relation.component.js';
export const PEACE_SYSTEM_ID = 'war.peace';
const GEO_PROVINCE_TYPE = 'geo.province';
export class PeaceSystem {
    descriptor = {
        id: PEACE_SYSTEM_ID,
        name: 'Peace Treaty System',
        priority: 490,
        requiredComponents: [],
        subscribedEvents: [WAR_PEACE_REQUESTED_EVENT],
        emittedEvents: [WAR_PEACE_SIGNED_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(WAR_PEACE_REQUESTED_EVENT, (event) => {
            this.processPeaceRequest(event.payload, worldState, eventBus);
        });
    }
    execute() {
    }
    processPeaceRequest(payload, worldState, eventBus) {
        const initiatorId = payload.initiator;
        const targetId = payload.target;
        const rel = worldState.getRelation(initiatorId, targetId);
        if (!rel)
            return;
        const relComponent = rel;
        const accepted = this.evaluateAcceptance(relComponent, worldState);
        if (!accepted)
            return;
        const returnedProvinces = [];
        if (payload.returnProvinces) {
            for (const provinceId of payload.returnProvinces) {
                const transferred = this.transferProvinceTo(provinceId, initiatorId, worldState);
                if (transferred) {
                    returnedProvinces.push(provinceId);
                }
            }
        }
        const newAffinity = Math.min(0, relComponent.affinity + 0.1);
        const newTension = 0.2;
        this.updateBilateralRelations(initiatorId, targetId, newAffinity, newTension, worldState);
        eventBus.publish(WAR_PEACE_SIGNED_EVENT, {
            initiator: payload.initiator,
            target: payload.target,
            returnedProvinces,
            newAffinity: Math.round(newAffinity * 100) / 100,
            newTension,
        }, PEACE_SYSTEM_ID, initiatorId);
    }
    evaluateAcceptance(rel, state) {
        const baseChance = 0.5;
        const affinityBonus = (rel.affinity + 1) * 0.25;
        const tensionPenalty = rel.tension > 0.8 ? 0.2 : 0;
        const finalChance = Math.min(0.95, Math.max(0.1, baseChance + affinityBonus - tensionPenalty));
        const tick = state.getMetadata().currentTick;
        const roll = ((tick * 1664525 + 1013904223) >>> 0) % 1000 / 1000;
        return roll < finalChance;
    }
    transferProvinceTo(provinceId, toCountryId, worldState) {
        const ws = worldState;
        for (const eid of ws.getEntityIds()) {
            const entity = ws.getEntity(eid);
            if (!entity)
                continue;
            const provComponent = entity.getComponent(GEO_PROVINCE_TYPE);
            if (!provComponent)
                continue;
            const provIndex = provComponent.provinces.findIndex((p) => p.provinceId === provinceId);
            if (provIndex === -1)
                continue;
            const [removed] = provComponent.provinces.splice(provIndex, 1);
            ws.updateComponent(eid, { type: GEO_PROVINCE_TYPE, provinces: provComponent.provinces });
            const targetEntity = ws.getEntity(toCountryId);
            const targetProvComponent = targetEntity?.getComponent(GEO_PROVINCE_TYPE);
            if (targetProvComponent) {
                ws.updateComponent(toCountryId, {
                    type: GEO_PROVINCE_TYPE,
                    provinces: [...targetProvComponent.provinces, { ...removed, ownerId: toCountryId }],
                });
            }
            else {
                ws.addComponent(toCountryId, {
                    type: GEO_PROVINCE_TYPE,
                    provinces: [{ ...removed, ownerId: toCountryId }],
                });
            }
            return true;
        }
        return false;
    }
    updateBilateralRelations(countryA, countryB, newAffinity, newTension, worldState) {
        const ws = worldState;
        const updated = new Set();
        for (const eid of ws.getEntityIds()) {
            const entity = ws.getEntity(eid);
            if (!entity)
                continue;
            const rel = entity.getComponent(DIPLOMATIC_RELATION_TYPE);
            if (!rel)
                continue;
            if (rel.targetCountryId !== countryA && rel.targetCountryId !== countryB)
                continue;
            const pairKey = eid < rel.targetCountryId ? `${eid}:${rel.targetCountryId}` : `${rel.targetCountryId}:${eid}`;
            if (updated.has(pairKey))
                continue;
            updated.add(pairKey);
            if ((eid === countryA && rel.targetCountryId === countryB) ||
                (eid === countryB && rel.targetCountryId === countryA)) {
                ws.updateComponent(eid, {
                    ...rel,
                    affinity: newAffinity,
                    tension: newTension,
                });
            }
        }
    }
}
//# sourceMappingURL=peace.system.js.map