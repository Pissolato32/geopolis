import { DIPLOMATIC_RELATION_TYPE } from '../diplomacy/components/relation.component.js';
import { SeedSanitizer } from '../../core/utils/seed-sanitizer.js';
/**
 * Utility to populate a WorldState instance from an IWorldSeed configuration (Base Seed)
 * merged with an optional BYOD Delta Patch (IDeltaSeedPayload).
 *
 * @param worldState - Target WorldState instance.
 * @param baseSeed - Base seed configuration shape (e.g. world-base.json).
 * @param deltaPatch - Optional raw or pre-sanitized BYOD Delta Patch.
 * @param overrideStartDate - Optional dynamic campaign start date override.
 */
export function loadWorldSeed(worldState, baseSeed, deltaPatch, overrideStartDate) {
    let sanitizationReport;
    let cleanPatch;
    if (deltaPatch) {
        const { sanitizedPayload, report } = SeedSanitizer.sanitizeDeltaPayload(deltaPatch);
        cleanPatch = sanitizedPayload;
        sanitizationReport = report;
    }
    const effectiveStartDate = overrideStartDate ?? cleanPatch?.campaignStartDate ?? baseSeed.startDate;
    // 1. Instantiate base entities and components
    for (const entitySeed of baseSeed.initialEntities) {
        if (!worldState.hasEntity(entitySeed.id)) {
            worldState.createEntity(entitySeed.id, entitySeed.components);
        }
    }
    // 2. Instantiate base relation edges
    for (const relSeed of baseSeed.initialRelations) {
        const relationComponent = {
            type: DIPLOMATIC_RELATION_TYPE,
            targetCountryId: relSeed.targetEntityId,
            affinity: relSeed.affinity,
            tension: relSeed.tension,
            recognition: relSeed.recognition,
            activeTreaties: [],
        };
        if (worldState.hasEntity(relSeed.sourceEntityId)) {
            const entity = worldState.getEntity(relSeed.sourceEntityId);
            if (entity?.hasComponent(DIPLOMATIC_RELATION_TYPE)) {
                worldState.updateComponent(relSeed.sourceEntityId, relationComponent);
            }
            else {
                worldState.addComponent(relSeed.sourceEntityId, relationComponent);
            }
        }
    }
    // 3. Apply BYOD Delta Patch overrides if provided
    if (cleanPatch) {
        for (const patchEntity of cleanPatch.entityPatches) {
            const entityId = patchEntity.id;
            if (!worldState.hasEntity(entityId)) {
                worldState.createEntity(entityId, patchEntity.components);
            }
            else {
                // Merge components onto existing entity
                for (const patchComp of patchEntity.components) {
                    const entity = worldState.getEntity(entityId);
                    if (entity.hasComponent(patchComp.type)) {
                        worldState.updateComponent(entityId, patchComp);
                    }
                    else {
                        worldState.addComponent(entityId, patchComp);
                    }
                }
            }
        }
    }
    return {
        effectiveStartDate,
        ...(sanitizationReport !== undefined ? { sanitizationReport } : {}),
    };
}
//# sourceMappingURL=seed-loader.js.map