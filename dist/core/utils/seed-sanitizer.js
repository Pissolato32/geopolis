/** Canonical ID alias resolution map (ISO-3166 alpha-2/3 + common names). */
const ALIAS_MAP = {
    // United States
    'us': 'country-us',
    'usa': 'country-us',
    'eua': 'country-us',
    'country-usa': 'country-us',
    'united states': 'country-us',
    'united states of america': 'country-us',
    // Brazil
    'br': 'country-br',
    'bra': 'country-br',
    'brasil': 'country-br',
    'brazil': 'country-br',
    'country-brazil': 'country-br',
    // China
    'cn': 'country-cn',
    'chn': 'country-cn',
    'china': 'country-cn',
    'country-china': 'country-cn',
    // Russia
    'ru': 'country-ru',
    'rus': 'country-ru',
    'russia': 'country-ru',
    'country-russia': 'country-ru',
    // United Kingdom
    'uk': 'country-gb',
    'gb': 'country-gb',
    'gbr': 'country-gb',
    'united kingdom': 'country-gb',
    'country-uk': 'country-gb',
    // Germany
    'de': 'country-de',
    'deu': 'country-de',
    'germany': 'country-de',
    'alemanha': 'country-de',
    // Argentina
    'ar': 'country-ar',
    'arg': 'country-ar',
    'argentina': 'country-ar',
};
export class SeedSanitizer {
    /**
     * Resolve raw entity ID or alias into canonical engine EntityId.
     */
    static canonicalizeEntityId(rawId) {
        const key = rawId.trim().toLowerCase();
        if (ALIAS_MAP[key]) {
            return ALIAS_MAP[key];
        }
        // Standard format already (e.g., country-br)
        if (key.startsWith('country-')) {
            return key;
        }
        return `country-${key}`;
    }
    /**
     * Clamp a numeric value between min and max bounds.
     */
    static clampNumber(val, min, max) {
        return Math.min(max, Math.max(min, val));
    }
    /**
     * Normalize percentages or scaled numbers (e.g. 85 or "85%" -> 0.85).
     */
    static normalizeFraction(val) {
        if (typeof val === 'string') {
            const parsed = parseFloat(val.replace('%', ''));
            if (isNaN(parsed))
                return 0.5;
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
    static sanitizeDeltaPayload(rawPayload) {
        const aliasesResolved = [];
        const valuesClamped = [];
        const fieldsDropped = [];
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
        const payload = rawPayload;
        const rawEntities = Array.isArray(payload['entityPatches'])
            ? payload['entityPatches']
            : [];
        const sanitizedEntities = [];
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
                ? rawEntity['components']
                : [];
            const sanitizedComponents = [];
            for (const rawComp of rawComponents) {
                if (!rawComp['type'] || typeof rawComp['type'] !== 'string')
                    continue;
                const compType = rawComp['type'];
                const cleanComp = { type: compType };
                for (const [k, v] of Object.entries(rawComp)) {
                    if (k === 'type')
                        continue;
                    if (k.endsWith('Rate') || k.endsWith('Index') || k.endsWith('Rating') || k.endsWith('Loyalty') || k.endsWith('Fraction')) {
                        if (typeof v === 'number' || typeof v === 'string') {
                            const origNum = typeof v === 'number' ? v : parseFloat(v);
                            const normalized = this.normalizeFraction(v);
                            const clamped = this.clampNumber(normalized, 0.0, 1.0);
                            if (clamped !== origNum) {
                                valuesClamped.push({ entityId: canonicalId, field: k, original: origNum, clamped });
                            }
                            cleanComp[k] = clamped;
                        }
                        else {
                            fieldsDropped.push({ entityId: canonicalId, field: k, reason: 'Invalid numeric fraction type' });
                        }
                    }
                    else {
                        cleanComp[k] = v;
                    }
                }
                sanitizedComponents.push(cleanComp);
            }
            sanitizedEntities.push({
                id: canonicalId,
                ...(typeof rawEntity['name'] === 'string' ? { name: rawEntity['name'] } : {}),
                components: sanitizedComponents,
            });
        }
        const report = {
            totalPatchesProcessed: sanitizedEntities.length,
            aliasesResolved,
            valuesClamped,
            fieldsDropped,
            isClean: aliasesResolved.length === 0 && valuesClamped.length === 0 && fieldsDropped.length === 0,
        };
        const sanitizedPayload = {
            ...(typeof payload['scenarioId'] === 'string' ? { scenarioId: payload['scenarioId'] } : {}),
            ...(typeof payload['campaignStartDate'] === 'string' ? { campaignStartDate: payload['campaignStartDate'] } : {}),
            ...(typeof payload['patchDescription'] === 'string' ? { patchDescription: payload['patchDescription'] } : {}),
            entityPatches: sanitizedEntities,
        };
        return { sanitizedPayload, report };
    }
}
//# sourceMappingURL=seed-sanitizer.js.map