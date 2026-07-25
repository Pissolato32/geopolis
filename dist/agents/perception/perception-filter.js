/**
 * Filter mechanism enforcing Fog of War constraints on global WorldState.
 * Prevents agents from accessing omniscient global state.
 */
export class PerceptionFilter {
    /**
     * Produce a dense, token-optimized YAML perception payload for a given agent country.
     *
     * @param worldState - The ground-truth WorldState.
     * @param countryId - The agent's focal country EntityId.
     * @param config - Filter options.
     * @returns Filtered dense YAML string payload for LLM prompt context.
     */
    static generatePerceptionDump(worldState, countryId, config = {}) {
        const dumpOptions = {
            perspectiveEntityId: countryId,
            focalRadius: config.focalRadius ?? 2,
            includeActiveCrises: config.includeActiveCrises ?? true,
            formatYaml: true,
            stripMetadata: true,
        };
        return worldState.dumpStateForAnalysis(dumpOptions);
    }
}
//# sourceMappingURL=perception-filter.js.map