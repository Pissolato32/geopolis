import {
  IIntentParser,
  IActionPayload,
  IValidationResult,
} from '../../core/interfaces/intent-parser.interface.js';
import { TickNumber } from '../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

/**
 * Strict Intent Parser implementing ADR-001 / ADR-002 Fail Fast input validation.
 * Parses JSON action payloads from LLM outputs and validates legality before EventBus emission.
 */
export class StrictIntentParser implements IIntentParser {
  /**
   * Extract JSON action payload from raw LLM prose output.
   */
  public parsePayload(rawText: string): IActionPayload | undefined {
    if (!rawText) return undefined;

    // Look for ```json ... ``` codeblock
    const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonString = jsonBlockMatch ? jsonBlockMatch[1] : rawText;

    try {
      const parsed = JSON.parse(jsonString!.trim());
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof parsed.actionType === 'string' &&
        typeof parsed.actorEntityId === 'string'
      ) {
        return {
          actionType: parsed.actionType,
          actorEntityId: parsed.actorEntityId as EntityId,
          ...(typeof parsed.targetEntityId === 'string' ? { targetEntityId: parsed.targetEntityId as EntityId } : {}),
          parameters: typeof parsed.parameters === 'object' && parsed.parameters !== null ? parsed.parameters : {},
          ...(typeof parsed.narrativeSummary === 'string' ? { narrativeSummary: parsed.narrativeSummary } : {}),
        };
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  /**
   * Validate an action payload against schema and current engine state (Fail Fast).
   */
  public validate(payload: IActionPayload, _currentTick: TickNumber): IValidationResult {
    const errors: string[] = [];

    if (!payload.actionType || payload.actionType.trim().length === 0) {
      errors.push('Action type is required');
    }

    if (!payload.actorEntityId || payload.actorEntityId.trim().length === 0) {
      errors.push('Actor entity ID is required');
    }

    // Specific domain action schema validation
    const params = payload.parameters ?? {};

    switch (payload.actionType) {
      case 'economy.impose-sanction':
        if (!params['targetCountryId']) errors.push('impose-sanction requires targetCountryId parameter');
        break;
      case 'economy.adjust-tax':
        if (typeof params['newTaxRate'] !== 'number' || params['newTaxRate'] < 0 || params['newTaxRate'] > 0.8) {
          errors.push('adjust-tax requires newTaxRate number between 0.0 and 0.8');
        }
        break;
      case 'diplomacy.propose-treaty':
        if (!Array.isArray(params['signatories']) || params['signatories'].length < 2) {
          errors.push('propose-treaty requires signatories array with at least 2 countries');
        }
        if (!params['treatyType']) {
          errors.push('propose-treaty requires treatyType parameter');
        }
        break;
      case 'war.move-ordered':
        if (!params['unitId']) errors.push('move-ordered requires unitId parameter');
        if (!params['targetProvinceId']) errors.push('move-ordered requires targetProvinceId parameter');
        break;
      case 'war.deploy-unit':
        if (!params['countryId']) errors.push('deploy-unit requires countryId parameter');
        if (!params['provinceId']) errors.push('deploy-unit requires provinceId parameter');
        if (typeof params['personnel'] !== 'number' || params['personnel'] <= 0) {
          errors.push('deploy-unit requires positive personnel count');
        }
        break;
      case 'war.request-peace':
        if (!params['initiator'] || !params['target']) {
          errors.push('request-peace requires initiator and target parameters');
        }
        break;
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        errors,
      };
    }

    return {
      isValid: true,
      validatedPayload: payload,
    };
  }
}
