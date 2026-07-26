import { describe, it, expect } from 'vitest';
import { StrictIntentParser } from './strict-intent-parser.js';
import { TickNumber } from '../../core/interfaces/event-bus.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';

describe('StrictIntentParser (Fail Fast Input Validation)', () => {
  it('should parse JSON payload enclosed in markdown codeblock', () => {
    const parser = new StrictIntentParser();
    const rawProse = `
The regime decides to increase defense readiness following recent regional tensions.

\`\`\`json
{
  "actionType": "military.mobilize",
  "actorEntityId": "country-br",
  "targetEntityId": "country-us",
  "parameters": { "level": 2 },
  "narrativeSummary": "Order military mobilization"
}
\`\`\`
`;

    const payload = parser.parsePayload(rawProse);
    expect(payload).toBeDefined();
    expect(payload!.actionType).toBe('military.mobilize');
    expect(payload!.actorEntityId).toBe('country-br');
    expect(payload!.parameters).toEqual({ level: 2 });
  });

  it('should return undefined for unparseable raw output', () => {
    const parser = new StrictIntentParser();
    expect(parser.parsePayload('Just plain text without JSON')).toBeUndefined();
  });

  it('should validate legal action payload', () => {
    const parser = new StrictIntentParser();
    const payload = {
      actionType: 'diplomacy.propose-treaty',
      actorEntityId: 'country-br' as EntityId,
      parameters: {
        signatories: ['country-br', 'country-us'],
        treatyType: 'non-aggression',
      },
    };

    const res = parser.validate(payload, 1 as TickNumber);
    expect(res.isValid).toBe(true);
    expect(res.validatedPayload).toBe(payload);
  });

  it('should reject invalid action payload (Fail Fast)', () => {
    const parser = new StrictIntentParser();
    const invalidPayload = {
      actionType: '',
      actorEntityId: '' as EntityId,
      parameters: {},
    };

    const res = parser.validate(invalidPayload, 1 as TickNumber);
    expect(res.isValid).toBe(false);
    expect(res.errors).toBeDefined();
    expect(res.errors!.length).toBeGreaterThan(0);
  });

  it('should reject invalid parameters for war.move-ordered and military.deploy-unit', () => {
    const parser = new StrictIntentParser();
    const badMove = {
      actionType: 'war.move-ordered',
      actorEntityId: 'country-br' as EntityId,
      parameters: {}, // missing unitId & targetProvinceId
    };

    const resMove = parser.validate(badMove, 1 as TickNumber);
    expect(resMove.isValid).toBe(false);
    expect(resMove.errors).toContain('move-ordered requires unitId parameter');

    const badDeploy = {
      actionType: 'military.deploy-unit',
      actorEntityId: 'country-br' as EntityId,
      parameters: { countryId: 'country-br', provinceId: 'prov-1', unitName: '1st Division', personnel: -100 },
    };

    const resDeploy = parser.validate(badDeploy, 1 as TickNumber);
    expect(resDeploy.isValid).toBe(false);
    expect(resDeploy.errors).toContain('deploy-unit requires positive personnel count');
  });
});
