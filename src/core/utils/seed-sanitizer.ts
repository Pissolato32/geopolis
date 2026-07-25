import { EntityId } from '../interfaces/entity.interface.js';
import { IDeltaSeedPayload, IPatchEntity, ISanitizationReport } from '../interfaces/seed-delta.interface.js';
import { IComponent } from '../interfaces/component.interface.js';

/** Canonical ID alias resolution map (ISO-3166 alpha-2/3 + common names). */
const ALIAS_MAP: Readonly<Record<string, EntityId>> = {
  // United States
  'us': 'country-us' as EntityId,
  'usa': 'country-us' as EntityId,
  'eua': 'country-us' as EntityId,
  'country-usa': 'country-us' as EntityId,
  'united states': 'country-us' as EntityId,
  'united states of america': 'country-us' as EntityId,

  // Brazil
  'br': 'country-br' as EntityId,
  'bra': 'country-br' as EntityId,
  'brasil': 'country-br' as EntityId,
  'brazil': 'country-br' as EntityId,
  'country-brazil': 'country-br' as EntityId,

  // China
  'cn': 'country-cn' as EntityId,
  'chn': 'country-cn' as EntityId,
  'china': 'country-cn' as EntityId,
  'country-china': 'country-cn' as EntityId,

  // Russia
  'ru': 'country-ru' as EntityId,
  'rus': 'country-ru' as EntityId,
  'russia': 'country-ru' as EntityId,
  'country-russia': 'country-ru' as EntityId,

  // United Kingdom
  'uk': 'country-gb' as EntityId,
  'gb': 'country-gb' as EntityId,
  'gbr': 'country-gb' as EntityId,
  'united kingdom': 'country-gb' as EntityId,
  'country-uk': 'country-gb' as EntityId,

  // Germany
  'de': 'country-de' as EntityId,
  'deu': 'country-de' as EntityId,
  'germany': 'country-de' as EntityId,
  'alemanha': 'country-de' as EntityId,

  // Argentina
  'ar': 'country-ar' as EntityId,
  'arg': 'country-ar' as EntityId,
  'argentina': 'country-ar' as EntityId,
};

export class SeedSanitizer {
  /**
   * Resolve raw entity ID or alias into canonical engine EntityId.
   */
  public static canonicalizeEntityId(rawId: string): EntityId {
    const key = rawId.trim().toLowerCase();
    if (ALIAS_MAP[key]) {
      return ALIAS_MAP[key]!;
    }
    // Standard format already (e.g., country-br)
    if (key.startsWith('country-')) {
      return key as EntityId;
    }
    return `country-${key}` as EntityId;
  }

  /**
   * Clamp a numeric value between min and max bounds.
   */
  public static clampNumber(val: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, val));
  }

  /**
   * Normalize percentages or scaled numbers (e.g. 85 or "85%" -> 0.85).
   */
  public static normalizeFraction(val: number | string): number {
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace('%', ''));
      if (isNaN(parsed)) return 0.5;
      return parsed > 1.0 ? parsed / 100 : parsed;
    }
    if (val > 1.0 && val <= 100.0) {
      return val / 100;
    }
    return val;
  }

  /**
   * Sanitize an incoming raw BYOD Delta Patch payload.
   * Auto-resolves aliases, normalizes numbers, clamps indices, and logs report.
   */
  public static sanitizeDeltaPayload(rawPayload: unknown): {
    sanitizedPayload: IDeltaSeedPayload;
    report: ISanitizationReport;
  } {
    const aliasesResolved: Array<{ rawId: string; canonicalId: EntityId }> = [];
    const valuesClamped: Array<{ entityId: string; field: string; original: number; clamped: number }> = [];
    const fieldsDropped: Array<{ entityId: string; field: string; reason: string }> = [];

    if (!rawPayload || typeof rawPayload !== 'object') {
      return {
        sanitizedPayload: { entityPatches: [] },
        report: {
          totalPatchesProcessed: 0,
          aliasesResolved: [],
          valuesClamped: [],
          fieldsDropped: [{ entityId: 'global', field: 'root', reason: 'Invalid or missing payload object' }],
          isClean: false,
        },
      };
    }

    const payload = rawPayload as Record<string, unknown>;
    const rawEntities = Array.isArray(payload['entityPatches'])
      ? (payload['entityPatches'] as Record<string, unknown>[])
      : [];

    const sanitizedEntities: IPatchEntity[] = [];

    for (const rawEntity of rawEntities) {
      if (!rawEntity['id'] || typeof rawEntity['id'] !== 'string') {
        fieldsDropped.push({ entityId: 'unknown', field: 'id', reason: 'Missing entity id' });
        continue;
      }

      const rawId = rawEntity['id'];
      const canonicalId = this.canonicalizeEntityId(rawId);

      if (canonicalId !== rawId) {
        aliasesResolved.push({ rawId, canonicalId });
      }

      const rawComponents = Array.isArray(rawEntity['components'])
        ? (rawEntity['components'] as Record<string, unknown>[])
        : [];

      const sanitizedComponents: IComponent[] = [];

      for (const rawComp of rawComponents) {
        if (!rawComp['type'] || typeof rawComp['type'] !== 'string') continue;

        const compType = rawComp['type'];
        const cleanComp: Record<string, unknown> = { type: compType };

        for (const [k, v] of Object.entries(rawComp)) {
          if (k === 'type') continue;

          if (k.endsWith('Rate') || k.endsWith('Index') || k.endsWith('Rating') || k.endsWith('Loyalty') || k.endsWith('Fraction')) {
            if (typeof v === 'number' || typeof v === 'string') {
              const origNum = typeof v === 'number' ? v : parseFloat(v as string);
              const normalized = this.normalizeFraction(v);
              const clamped = this.clampNumber(normalized, 0.0, 1.0);

              if (clamped !== origNum) {
                valuesClamped.push({ entityId: canonicalId, field: k, original: origNum, clamped });
              }
              cleanComp[k] = clamped;
            } else {
              fieldsDropped.push({ entityId: canonicalId, field: k, reason: 'Invalid numeric fraction type' });
            }
          } else {
            cleanComp[k] = v;
          }
        }

        sanitizedComponents.push(cleanComp as unknown as IComponent);
      }

      sanitizedEntities.push({
        id: canonicalId,
        ...(typeof rawEntity['name'] === 'string' ? { name: rawEntity['name'] } : {}),
        components: sanitizedComponents,
      });
    }

    const report: ISanitizationReport = {
      totalPatchesProcessed: sanitizedEntities.length,
      aliasesResolved,
      valuesClamped,
      fieldsDropped,
      isClean: aliasesResolved.length === 0 && valuesClamped.length === 0 && fieldsDropped.length === 0,
    };

    const sanitizedPayload: IDeltaSeedPayload = {
      ...(typeof payload['scenarioId'] === 'string' ? { scenarioId: payload['scenarioId'] } : {}),
      ...(typeof payload['campaignStartDate'] === 'string' ? { campaignStartDate: payload['campaignStartDate'] } : {}),
      ...(typeof payload['patchDescription'] === 'string' ? { patchDescription: payload['patchDescription'] } : {}),
      entityPatches: sanitizedEntities,
    };

    return { sanitizedPayload, report };
  }
}
