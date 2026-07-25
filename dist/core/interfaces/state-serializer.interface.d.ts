/**
 * @module core/interfaces/state-serializer
 * @description Contract for dense state serialization and Fog of War filtering.
 *
 * Implements ADR-001 output optimization requirements: filters global world state
 * (~208 countries) down to a minimal, dense YAML string tailored for LLM AI context.
 */
import { IWorldState } from './world-state.interface.js';
import { EntityId } from './entity.interface.js';
/** Options for customizing the dense state export for an agent or player. */
export interface IDenseStateDumpOptions {
    /** The perspective entity (country or agent) for Fog of War filtering. */
    readonly perspectiveEntityId: EntityId;
    /** Maximum geographic or relational depth (hop count) from perspective. */
    readonly focalRadius?: number;
    /** Include active narrative crisis entities in the dump. Defaults to true. */
    readonly includeActiveCrises?: boolean;
    /** Format output as dense YAML string. Defaults to true. */
    readonly formatYaml?: boolean;
    /** Exclude raw UUIDs and metadata timestamps to minimize token count. Defaults to true. */
    readonly stripMetadata?: boolean;
}
/**
 * Contract for serializing World State into dense, token-optimized payloads.
 */
export interface IStateSerializer {
    /**
     * Filter and serialize the World State into a token-optimized YAML/text dump
     * for an agent operating under Fog of War.
     *
     * @param state - The current World State.
     * @param options - Filtering and formatting options.
     * @returns Dense formatted string representation of perceived state.
     */
    dumpStateForAnalysis(state: Readonly<IWorldState>, options: IDenseStateDumpOptions): string;
}
//# sourceMappingURL=state-serializer.interface.d.ts.map