import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IWorldSeed } from '../../core/interfaces/world-seed.interface.js';
import { IDeltaSeedPayload, ISanitizationReport } from '../../core/interfaces/seed-delta.interface.js';
import { IComponent } from '../../core/interfaces/component.interface.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from '../diplomacy/components/relation.component.js';
import { SeedSanitizer } from '../../core/utils/seed-sanitizer.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { GEO_POSITION_TYPE } from './geo-position.component.js';

/**
 * Utility to populate a WorldState instance from an IWorldSeed configuration (Base Seed)
 * merged with an optional BYOD Delta Patch (IDeltaSeedPayload).
 *
 * @param worldState - Target WorldState instance.
 * @param baseSeed - Base seed configuration shape (e.g. world-base.json).
 * @param deltaPatch - Optional raw or pre-sanitized BYOD Delta Patch.
 * @param overrideStartDate - Optional dynamic campaign start date override.
 */
export function loadWorldSeed(
  worldState: IWorldState,
  baseSeed: IWorldSeed,
  deltaPatch?: unknown,
  overrideStartDate?: string,
): { effectiveStartDate: string; sanitizationReport?: ISanitizationReport } {
  let sanitizationReport: ISanitizationReport | undefined;
  let cleanPatch: IDeltaSeedPayload | undefined;

  if (deltaPatch) {
    const { sanitizedPayload, report } = SeedSanitizer.sanitizeDeltaPayload(deltaPatch);
    cleanPatch = sanitizedPayload;
    sanitizationReport = report;
  }

  const effectiveStartDate = overrideStartDate ?? cleanPatch?.campaignStartDate ?? baseSeed.startDate;

  // 1. Instantiate base entities and components
  for (const entitySeed of baseSeed.initialEntities) {
    if (!worldState.hasEntity(entitySeed.id)) {
      const components = [...entitySeed.components];
      if (entitySeed.position) {
        components.push({
          type: GEO_POSITION_TYPE,
          lat: entitySeed.position.lat,
          lng: entitySeed.position.lng,
        } as unknown as IComponent);
      }
      worldState.createEntity(entitySeed.id, components);
    }
  }

  // 2. Instantiate base relation edges
  for (const relSeed of baseSeed.initialRelations) {
    const relationComponent: RelationComponent = {
      type: DIPLOMATIC_RELATION_TYPE,
      targetCountryId: relSeed.targetEntityId,
      affinity: relSeed.affinity,
      tension: relSeed.tension,
      recognition: relSeed.recognition as 'full' | 'partial' | 'unrecognized',
      activeTreaties: [],
    };

    if (worldState.hasEntity(relSeed.sourceEntityId)) {
      const entity = worldState.getEntity(relSeed.sourceEntityId);
      if (entity?.hasComponent(DIPLOMATIC_RELATION_TYPE)) {
        worldState.updateComponent(relSeed.sourceEntityId, relationComponent);
      } else {
        worldState.addComponent(relSeed.sourceEntityId, relationComponent);
      }
    }
  }

  // 3. Apply BYOD Delta Patch overrides if provided
  if (cleanPatch) {
    for (const patchEntity of cleanPatch.entityPatches) {
      const entityId = patchEntity.id as EntityId;

      if (!worldState.hasEntity(entityId)) {
        worldState.createEntity(entityId, patchEntity.components);
      } else {
        // Merge components onto existing entity
        for (const patchComp of patchEntity.components) {
          const entity = worldState.getEntity(entityId)!;
          if (entity.hasComponent(patchComp.type)) {
            worldState.updateComponent(entityId, patchComp);
          } else {
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
