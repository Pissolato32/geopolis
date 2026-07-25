import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { ISystem } from '../core/interfaces/system.interface.js';
import { IComponent, ComponentType } from '../core/interfaces/component.interface.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { ScenarioTriggerSystem } from './scenario.trigger-system.js';
import { IScenarioLoadResult } from './scenario.types.js';
export declare const GEO_PROVINCE_TYPE: ComponentType;
export declare const GEO_POSITION_TYPE: ComponentType;
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
export declare class ScenarioLoader {
    private readonly validator;
    loadFromFile(filePath: string, config: IScenarioLoaderConfig): IScenarioLoadEngineResult;
    loadFromPreset(data: unknown, config: IScenarioLoaderConfig): IScenarioLoadEngineResult;
}
//# sourceMappingURL=scenario.loader.d.ts.map