import { WAR_COMBAT_RESOLVED_EVENT, WAR_PROVINCE_CAPTURED_EVENT, } from '../events/war.events.js';
import { DIPLOMATIC_RELATION_TYPE, } from '../../diplomacy/components/relation.component.js';
import { PROVINCE_COMBAT_SYSTEM_ID } from './province-combat.system.js';
export const OCCUPATION_SYSTEM_ID = 'war.occupation';
const GEO_PROVINCE_TYPE = 'geo.province';
export class OccupationSystem {
    descriptor = {
        id: OCCUPATION_SYSTEM_ID,
        name: 'Province Occupation System',
        priority: 470,
        requiredComponents: [],
        subscribedEvents: [WAR_COMBAT_RESOLVED_EVENT],
        emittedEvents: [WAR_PROVINCE_CAPTURED_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(WAR_COMBAT_RESOLVED_EVENT, (event) => {
            if (event.sourceSystem !== PROVINCE_COMBAT_SYSTEM_ID)
                return;
            if (!event.payload.eliminatedId)
                return;
            this.transferProvince(event.payload.provinceId, event.payload.eliminatedId, event.payload.victorId, worldState, eventBus);
        });
    }
    execute() {
    }
    transferProvince(provinceId, eliminatedId, victorId, worldState, eventBus) {
        const ws = worldState;
        const eliminatedEntityId = eliminatedId;
        const victorEntityId = victorId;
        let provinceName = '';
        let found = false;
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
            provinceName = provComponent.provinces[provIndex].provinceName;
            const updatedProvinces = [...provComponent.provinces];
            const [removed] = updatedProvinces.splice(provIndex, 1);
            ws.updateComponent(eid, { type: GEO_PROVINCE_TYPE, provinces: updatedProvinces });
            const victorEntity = ws.getEntity(victorEntityId);
            const victorProvComponent = victorEntity?.getComponent(GEO_PROVINCE_TYPE);
            if (victorProvComponent) {
                ws.updateComponent(victorEntityId, {
                    type: GEO_PROVINCE_TYPE,
                    provinces: [...victorProvComponent.provinces, { ...removed, ownerId: victorId }],
                });
            }
            else {
                ws.addComponent(victorEntityId, {
                    type: GEO_PROVINCE_TYPE,
                    provinces: [{ ...removed, ownerId: victorId }],
                });
            }
            found = true;
            break;
        }
        if (!found)
            return;
        this.adjustRelations(eliminatedEntityId, victorEntityId, worldState);
        eventBus.publish(WAR_PROVINCE_CAPTURED_EVENT, {
            provinceId,
            provinceName,
            newOwnerId: victorId,
            oldOwnerId: eliminatedId,
        }, OCCUPATION_SYSTEM_ID, victorEntityId);
    }
    adjustRelations(eliminatedId, victorId, worldState) {
        const ws = worldState;
        for (const eid of ws.getEntityIds()) {
            const entity = ws.getEntity(eid);
            if (!entity)
                continue;
            const rel = entity.getComponent(DIPLOMATIC_RELATION_TYPE);
            if (!rel)
                continue;
            if (rel.targetCountryId === eliminatedId || rel.targetCountryId === victorId) {
                const newAffinity = Math.max(-1, rel.affinity - 0.2);
                const newTension = Math.min(1, rel.tension + 0.15);
                ws.updateComponent(eid, {
                    ...rel,
                    affinity: Math.round(newAffinity * 100) / 100,
                    tension: Math.round(newTension * 100) / 100,
                });
            }
        }
    }
}
//# sourceMappingURL=occupation.system.js.map