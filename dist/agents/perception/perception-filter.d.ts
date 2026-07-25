import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
export interface IPerceptionFilterConfig {
    readonly includeAllies?: boolean;
    readonly focalRadius?: number;
    readonly includeActiveCrises?: boolean;
}
/**
 * Filter mechanism enforcing Fog of War constraints on global WorldState.
 * Prevents agents from accessing omniscient global state.
 */
export declare class PerceptionFilter {
    /**
     * Produce a dense, token-optimized YAML perception payload for a given agent country.
     *
     * @param worldState - The ground-truth WorldState.
     * @param countryId - The agent's focal country EntityId.
     * @param config - Filter options.
     * @returns Filtered dense YAML string payload for LLM prompt context.
     */
    static generatePerceptionDump(worldState: Readonly<IWorldState>, countryId: EntityId, config?: IPerceptionFilterConfig): string;
}
//# sourceMappingURL=perception-filter.d.ts.map