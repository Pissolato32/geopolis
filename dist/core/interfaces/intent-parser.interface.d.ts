/**
 * @module core/interfaces/intent-parser
 * @description Contract for LLM intent parsing and action payload validation.
 *
 * Implements ADR-001 input validation requirements: parses LLM narrative JSON payloads,
 * checks validity against engine rules (Fail Fast), and produces validated event candidates.
 */
import { EntityId } from './entity.interface.js';
import { TickNumber } from './event-bus.interface.js';
/** Action payload extracted from LLM output. */
export interface IActionPayload {
    /** Target action type name (e.g., "diplomacy.propose-treaty", "military.deploy-unit"). */
    readonly actionType: string;
    /** Entity executing the action. */
    readonly actorEntityId: EntityId;
    /** Primary target entity (if applicable). */
    readonly targetEntityId?: EntityId;
    /** Arbitrary structured action parameters. */
    readonly parameters: Readonly<Record<string, unknown>>;
    /** Raw narrative text that accompanied the action. */
    readonly narrativeSummary?: string;
}
/** Result of validating an LLM action payload. */
export interface IValidationResult {
    /** Whether the action payload is valid and legal in the current tick state. */
    readonly isValid: boolean;
    /** Sanitized action payload ready for emission to EventBus. */
    readonly validatedPayload?: IActionPayload;
    /** Error messages detailing validation failures or rule violations. */
    readonly errors?: ReadonlyArray<string>;
}
/**
 * Contract for parsing and validating raw LLM text/JSON outputs.
 */
export interface IIntentParser {
    /**
     * Extract action payload from raw LLM output text.
     * @param rawText - Raw string output from LLM (prose + trailing JSON payload).
     * @returns Parsed action payload or undefined if unparseable.
     */
    parsePayload(rawText: string): IActionPayload | undefined;
    /**
     * Validate an action payload against current engine state and rules (Fail Fast).
     * @param payload - Action payload to validate.
     * @param currentTick - The current tick number.
     * @returns Validation result with pass/fail status and details.
     */
    validate(payload: IActionPayload, currentTick: TickNumber): IValidationResult;
}
//# sourceMappingURL=intent-parser.interface.d.ts.map