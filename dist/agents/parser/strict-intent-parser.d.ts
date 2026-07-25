import { IIntentParser, IActionPayload, IValidationResult } from '../../core/interfaces/intent-parser.interface.js';
import { TickNumber } from '../../core/interfaces/event-bus.interface.js';
/**
 * Strict Intent Parser implementing ADR-001 / ADR-002 Fail Fast input validation.
 * Parses JSON action payloads from LLM outputs and validates legality before EventBus emission.
 */
export declare class StrictIntentParser implements IIntentParser {
    /**
     * Extract JSON action payload from raw LLM prose output.
     */
    parsePayload(rawText: string): IActionPayload | undefined;
    /**
     * Validate an action payload against schema and current engine state (Fail Fast).
     */
    validate(payload: IActionPayload, _currentTick: TickNumber): IValidationResult;
}
//# sourceMappingURL=strict-intent-parser.d.ts.map