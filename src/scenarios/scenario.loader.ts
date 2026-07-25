import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { ISystem } from '../core/interfaces/system.interface.js';
import { IComponent, ComponentType } from '../core/interfaces/component.interface.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { DIPLOMATIC_RELATION_TYPE, RelationComponent } from '../domain/diplomacy/components/relation.component.js';
import { ScenarioSchemaValidator } from './scenario.validator.js';
import { ScenarioTriggerSystem } from './scenario.trigger-system.js';
import {
  IScenarioPreset,
  IScenarioLoadResult,
  IScenarioValidationResult,
} from './scenario.types.js';

export const GEO_PROVINCE_TYPE = 'geo.province' as ComponentType;
export const GEO_POSITION_TYPE = 'geo.position' as ComponentType;

export interface GeoPositionComponent extends IComponent {
  readonly type: typeof GEO_POSITION_TYPE;
  readonly lat: number;
  readonly lng: number;
}

export interface ProvinceEntry {
  readonly provinceId: string;
  readonly provinceName: string;
  readonly lat: number;
  readonly lng: number;
  readonly neighborIds: ReadonlyArray<string>;
  readonly resourceRich: boolean;
  readonly ownerId: EntityId;
}

export interface ProvinceListComponent extends IComponent {
  readonly type: typeof GEO_PROVINCE_TYPE;
  readonly provinces: ReadonlyArray<ProvinceEntry>;
}

export interface IScenarioLoaderConfig {
  systems: ReadonlyArray<ISystem>;
}

export interface IScenarioLoadEngineResult {
  engine: TickEngine;
  worldState: WorldState;
  eventBus: EventBus;
  timeline: Timeline;
  systems: ISystem[];
  triggerSystem: ScenarioTriggerSystem;
  loadResult: IScenarioLoadResult;
}

export class ScenarioLoader {
  private readonly validator = new ScenarioSchemaValidator();

  public loadFromFile(filePath: string, config: IScenarioLoaderConfig): IScenarioLoadEngineResult {
    const absPath = resolve(filePath);

    if (!existsSync(absPath)) {
      throw new Error(`Scenario file not found: ${absPath}`);
    }

    const raw = readFileSync(absPath, 'utf-8');
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Scenario file is not valid JSON: ${absPath}`);
    }

    return this.loadFromPreset(parsed, config);
  }

  public loadFromPreset(data: unknown, config: IScenarioLoaderConfig): IScenarioLoadEngineResult {
    const validation: IScenarioValidationResult = this.validator.validate(data);

    if (!validation.valid) {
      const messages = validation.errors.map((e) => `  [${e.path}] ${e.message}`).join('\n');
      throw new Error(`Scenario validation failed:\n${messages}`);
    }

    const preset = data as IScenarioPreset;
    const scenarioId = `scenario-${preset.metadata.name.toLowerCase().replace(/\s+/g, '-')}`;

    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState(scenarioId);
    const engine = new TickEngine(worldState, eventBus, timeline);

    // Load entities
    const entityIds = new Set<string>();
    for (const entitySeed of preset.worldState.entities) {
      if (entityIds.has(entitySeed.id as string)) {
        throw new Error(`Duplicate entity id in scenario: ${entitySeed.id}`);
      }
      entityIds.add(entitySeed.id as string);

      const components = [...entitySeed.components];
      if (entitySeed.position) {
        const positionComponent: GeoPositionComponent = {
          type: GEO_POSITION_TYPE,
          lat: entitySeed.position.lat,
          lng: entitySeed.position.lng,
        };
        components.push(positionComponent);
      }

      worldState.createEntity(entitySeed.id, components);
    }

    // Load relations
    for (const relSeed of preset.worldState.relations) {
      const relationComponent: RelationComponent = {
        type: DIPLOMATIC_RELATION_TYPE,
        targetCountryId: relSeed.targetEntityId,
        affinity: relSeed.affinity,
        tension: relSeed.tension,
        recognition: relSeed.recognition,
        activeTreaties: [],
      };

      if (worldState.hasEntity(relSeed.sourceEntityId)) {
        const entity = worldState.getEntity(relSeed.sourceEntityId)!;
        if (entity.hasComponent(DIPLOMATIC_RELATION_TYPE)) {
          worldState.updateComponent(relSeed.sourceEntityId, relationComponent);
        } else {
          worldState.addComponent(relSeed.sourceEntityId, relationComponent);
        }
      }
    }

    // Load provinces grouped by owner as a single ProvinceListComponent
    const provinceSeeds = preset.worldState.provinces ?? [];
    const provincesByOwner = new Map<EntityId, ProvinceEntry[]>();
    for (const provSeed of provinceSeeds) {
      if (!provincesByOwner.has(provSeed.ownerId)) {
        provincesByOwner.set(provSeed.ownerId, []);
      }
      provincesByOwner.get(provSeed.ownerId)!.push({
        provinceId: provSeed.id,
        provinceName: provSeed.name,
        lat: provSeed.lat,
        lng: provSeed.lng,
        neighborIds: provSeed.neighborIds,
        resourceRich: provSeed.resourceRich ?? false,
        ownerId: provSeed.ownerId,
      });
    }
    for (const [ownerId, provinces] of provincesByOwner) {
      if (worldState.hasEntity(ownerId)) {
        worldState.addComponent(ownerId, { type: GEO_PROVINCE_TYPE, provinces } as IComponent);
      }
    }

    // Create trigger system with events
    const triggerSystem = new ScenarioTriggerSystem(preset.eventTriggers);
    engine.registerSystem(triggerSystem);

    // Register domain systems
    for (const sys of config.systems) {
      engine.registerSystem(sys);
    }

    const startDate = new Date().toISOString().split('T')[0]!;

    return {
      engine,
      worldState,
      eventBus,
      timeline,
      systems: [triggerSystem, ...config.systems],
      triggerSystem,
      loadResult: {
        scenarioId,
        entityCount: preset.worldState.entities.length,
        relationCount: preset.worldState.relations.length,
        triggerCount: preset.eventTriggers.length,
        provinceCount: provinceSeeds.length,
        effectiveStartDate: startDate,
      },
    };
  }
}
