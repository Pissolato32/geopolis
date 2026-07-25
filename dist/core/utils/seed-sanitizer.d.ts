import { EntityId } from '../interfaces/entity.interface.js';
import { IDeltaSeedPayload, ISanitizationReport } from '../interfaces/seed-delta.interface.js';
export declare class SeedSanitizer {
    /**
     * Resolve raw entity ID or alias into canonical engine EntityId.
     */
    static canonicalizeEntityId(rawId: string): EntityId;
    /**
     * Clamp a numeric value between min and max bounds.
     */
    static clampNumber(val: number, min: number, max: number): number;
    /**
     * Normalize percentages or scaled numbers (e.g. 85 or "85%" -> 0.85).
     */
    static normalizeFraction(val: number | string): number;
    /**
     * Sanitize an incoming raw BYOD Delta Patch payload.
     * Auto-resolves aliases, normalizes numbers, clamps indices, and logs report.
     */
    static sanitizeDeltaPayload(rawPayload: unknown): {
        sanitizedPayload: IDeltaSeedPayload;
        report: ISanitizationReport;
    };
}
//# sourceMappingURL=seed-sanitizer.d.ts.map