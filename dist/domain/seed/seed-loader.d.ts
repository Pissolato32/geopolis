import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { IWorldSeed } from '../../core/interfaces/world-seed.interface.js';
import { ISanitizationReport } from '../../core/interfaces/seed-delta.interface.js';
/**
 * Utility to populate a WorldState instance from an IWorldSeed configuration (Base Seed)
 * merged with an optional BYOD Delta Patch (IDeltaSeedPayload).
 *
 * @param worldState - Target WorldState instance.
 * @param baseSeed - Base seed configuration shape (e.g. world-base.json).
 * @param deltaPatch - Optional raw or pre-sanitized BYOD Delta Patch.
 * @param overrideStartDate - Optional dynamic campaign start date override.
 */
export declare function loadWorldSeed(worldState: IWorldState, baseSeed: IWorldSeed, deltaPatch?: unknown, overrideStartDate?: string): {
    effectiveStartDate: string;
    sanitizationReport?: ISanitizationReport;
};
//# sourceMappingURL=seed-loader.d.ts.map