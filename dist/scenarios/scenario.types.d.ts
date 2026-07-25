import { EntityId } from '../core/interfaces/entity.interface.js';
import { IComponent } from '../core/interfaces/component.interface.js';
export interface IScenarioSimulationConfig {
    maxTicks?: number;
    seed?: number;
}
export interface IGeoPosition {
    readonly lat: number;
    readonly lng: number;
}
export interface IScenarioProvinceSeed {
    readonly id: string;
    readonly name: string;
    readonly lat: number;
    readonly lng: number;
    readonly neighborIds: ReadonlyArray<string>;
    readonly ownerId: EntityId;
    readonly resourceRich?: boolean;
}
export interface IScenarioEntitySeed {
    readonly id: EntityId;
    readonly name: string;
    readonly entityType: string;
    readonly components: ReadonlyArray<Readonly<IComponent>>;
    readonly position?: Readonly<IGeoPosition>;
}
export interface IScenarioRelationSeed {
    readonly sourceEntityId: EntityId;
    readonly targetEntityId: EntityId;
    readonly affinity: number;
    readonly tension: number;
    readonly recognition: 'full' | 'partial' | 'unrecognized';
}
export interface IScenarioEventTrigger {
    readonly tick: number;
    readonly eventType: string;
    readonly parameters: Readonly<Record<string, unknown>>;
}
export interface IScenarioMetadata {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly simulation: Readonly<IScenarioSimulationConfig>;
}
export interface IScenarioWorldState {
    readonly entities: ReadonlyArray<Readonly<IScenarioEntitySeed>>;
    readonly relations: ReadonlyArray<Readonly<IScenarioRelationSeed>>;
    readonly provinces?: ReadonlyArray<Readonly<IScenarioProvinceSeed>>;
}
export interface IScenarioPreset {
    readonly metadata: Readonly<IScenarioMetadata>;
    readonly worldState: Readonly<IScenarioWorldState>;
    readonly eventTriggers: ReadonlyArray<Readonly<IScenarioEventTrigger>>;
}
export interface IScenarioValidationError {
    readonly path: string;
    readonly message: string;
}
export interface IScenarioValidationResult {
    readonly valid: boolean;
    readonly errors: ReadonlyArray<IScenarioValidationError>;
}
export interface IScenarioLoadResult {
    readonly scenarioId: string;
    readonly entityCount: number;
    readonly relationCount: number;
    readonly triggerCount: number;
    readonly provinceCount: number;
    readonly effectiveStartDate: string;
}
//# sourceMappingURL=scenario.types.d.ts.map