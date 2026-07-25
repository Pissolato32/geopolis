export class ScenarioSchemaValidator {
    validate(data) {
        const errors = [];
        if (typeof data !== 'object' || data === null) {
            return { valid: false, errors: [{ path: '', message: 'Root must be a non-null object' }] };
        }
        const preset = data;
        this.validateMetadata(preset['metadata'], errors);
        this.validateWorldState(preset['worldState'], errors);
        this.validateEventTriggers(preset['eventTriggers'], errors);
        return { valid: errors.length === 0, errors };
    }
    validateMetadata(metadata, errors) {
        if (typeof metadata !== 'object' || metadata === null) {
            errors.push({ path: 'metadata', message: 'metadata is required and must be an object' });
            return;
        }
        const m = metadata;
        if (typeof m['name'] !== 'string' || m['name'] === '') {
            errors.push({ path: 'metadata.name', message: 'metadata.name is required and must be a non-empty string' });
        }
        if (typeof m['version'] !== 'string' || m['version'] === '') {
            errors.push({ path: 'metadata.version', message: 'metadata.version is required and must be a non-empty string' });
        }
        if (typeof m['description'] !== 'string') {
            errors.push({ path: 'metadata.description', message: 'metadata.description is required and must be a string' });
        }
        if (m['simulation'] !== undefined) {
            if (typeof m['simulation'] !== 'object' || m['simulation'] === null) {
                errors.push({ path: 'metadata.simulation', message: 'metadata.simulation must be an object if provided' });
            }
            else {
                const sim = m['simulation'];
                if (sim['maxTicks'] !== undefined && (typeof sim['maxTicks'] !== 'number' || sim['maxTicks'] < 0)) {
                    errors.push({ path: 'metadata.simulation.maxTicks', message: 'must be a non-negative number if provided' });
                }
                if (sim['seed'] !== undefined && (typeof sim['seed'] !== 'number' || !Number.isInteger(sim['seed']))) {
                    errors.push({ path: 'metadata.simulation.seed', message: 'must be an integer if provided' });
                }
            }
        }
    }
    validateWorldState(worldState, errors) {
        if (typeof worldState !== 'object' || worldState === null) {
            errors.push({ path: 'worldState', message: 'worldState is required and must be an object' });
            return;
        }
        const ws = worldState;
        if (!Array.isArray(ws['entities'])) {
            errors.push({ path: 'worldState.entities', message: 'worldState.entities is required and must be an array' });
        }
        else {
            for (let i = 0; i < ws['entities'].length; i++) {
                this.validateEntity(ws['entities'][i], `worldState.entities[${i}]`, errors);
            }
        }
        if (ws['relations'] !== undefined) {
            if (!Array.isArray(ws['relations'])) {
                errors.push({ path: 'worldState.relations', message: 'worldState.relations must be an array if provided' });
            }
            else {
                for (let i = 0; i < ws['relations'].length; i++) {
                    this.validateRelation(ws['relations'][i], `worldState.relations[${i}]`, errors);
                }
            }
        }
        if (ws['provinces'] !== undefined) {
            if (!Array.isArray(ws['provinces'])) {
                errors.push({ path: 'worldState.provinces', message: 'worldState.provinces must be an array if provided' });
            }
            else {
                for (let i = 0; i < ws['provinces'].length; i++) {
                    this.validateProvince(ws['provinces'][i], `worldState.provinces[${i}]`, errors);
                }
            }
        }
    }
    validateEntity(entity, path, errors) {
        if (typeof entity !== 'object' || entity === null) {
            errors.push({ path, message: 'entity must be a non-null object' });
            return;
        }
        const e = entity;
        if (typeof e['id'] !== 'string' || e['id'] === '') {
            errors.push({ path: `${path}.id`, message: 'entity.id is required and must be a non-empty string' });
        }
        if (typeof e['name'] !== 'string') {
            errors.push({ path: `${path}.name`, message: 'entity.name is required and must be a string' });
        }
        if (typeof e['entityType'] !== 'string' || e['entityType'] === '') {
            errors.push({ path: `${path}.entityType`, message: 'entity.entityType is required and must be a non-empty string' });
        }
        if (!Array.isArray(e['components'])) {
            errors.push({ path: `${path}.components`, message: 'entity.components is required and must be an array' });
        }
        else {
            for (let j = 0; j < e['components'].length; j++) {
                const comp = e['components'][j];
                if (typeof comp !== 'object' || comp === null) {
                    errors.push({ path: `${path}.components[${j}]`, message: 'component must be a non-null object' });
                }
                else if (typeof comp['type'] !== 'string') {
                    errors.push({ path: `${path}.components[${j}].type`, message: 'component.type is required and must be a string' });
                }
                else {
                    const compTyped = comp;
                    if (compTyped['type'] === 'war.unit' && typeof compTyped['currentProvinceId'] !== 'string') {
                        errors.push({ path: `${path}.components[${j}].currentProvinceId`, message: 'war.unit component requires currentProvinceId' });
                    }
                }
            }
        }
        if (e['position'] !== undefined) {
            if (typeof e['position'] !== 'object' || e['position'] === null) {
                errors.push({ path: `${path}.position`, message: 'position must be an object if provided' });
            }
            else {
                const pos = e['position'];
                if (typeof pos['lat'] !== 'number' || pos['lat'] < -90 || pos['lat'] > 90) {
                    errors.push({ path: `${path}.position.lat`, message: 'lat must be a number between -90 and 90' });
                }
                if (typeof pos['lng'] !== 'number' || pos['lng'] < -180 || pos['lng'] > 180) {
                    errors.push({ path: `${path}.position.lng`, message: 'lng must be a number between -180 and 180' });
                }
            }
        }
    }
    validateProvince(province, path, errors) {
        if (typeof province !== 'object' || province === null) {
            errors.push({ path, message: 'province must be a non-null object' });
            return;
        }
        const p = province;
        if (typeof p['id'] !== 'string' || p['id'] === '') {
            errors.push({ path: `${path}.id`, message: 'province.id is required and must be a non-empty string' });
        }
        if (typeof p['name'] !== 'string') {
            errors.push({ path: `${path}.name`, message: 'province.name is required and must be a string' });
        }
        if (typeof p['lat'] !== 'number' || p['lat'] < -90 || p['lat'] > 90) {
            errors.push({ path: `${path}.lat`, message: 'lat must be a number between -90 and 90' });
        }
        if (typeof p['lng'] !== 'number' || p['lng'] < -180 || p['lng'] > 180) {
            errors.push({ path: `${path}.lng`, message: 'lng must be a number between -180 and 180' });
        }
        if (!Array.isArray(p['neighborIds'])) {
            errors.push({ path: `${path}.neighborIds`, message: 'neighborIds is required and must be an array' });
        }
        if (typeof p['ownerId'] !== 'string' || p['ownerId'] === '') {
            errors.push({ path: `${path}.ownerId`, message: 'ownerId is required and must be a non-empty string' });
        }
    }
    validateRelation(relation, path, errors) {
        if (typeof relation !== 'object' || relation === null) {
            errors.push({ path, message: 'relation must be a non-null object' });
            return;
        }
        const r = relation;
        if (typeof r['sourceEntityId'] !== 'string' || r['sourceEntityId'] === '') {
            errors.push({ path: `${path}.sourceEntityId`, message: 'sourceEntityId is required and must be non-empty' });
        }
        if (typeof r['targetEntityId'] !== 'string' || r['targetEntityId'] === '') {
            errors.push({ path: `${path}.targetEntityId`, message: 'targetEntityId is required and must be non-empty' });
        }
        if (typeof r['affinity'] !== 'number' || r['affinity'] < -1 || r['affinity'] > 1) {
            errors.push({ path: `${path}.affinity`, message: 'affinity must be a number between -1 and 1' });
        }
        if (typeof r['tension'] !== 'number' || r['tension'] < 0 || r['tension'] > 1) {
            errors.push({ path: `${path}.tension`, message: 'tension must be a number between 0 and 1' });
        }
        const validRecognitions = ['full', 'partial', 'unrecognized'];
        if (!validRecognitions.includes(r['recognition'])) {
            errors.push({ path: `${path}.recognition`, message: 'recognition must be one of: full, partial, unrecognized' });
        }
    }
    validateEventTriggers(triggers, errors) {
        if (triggers === undefined)
            return;
        if (!Array.isArray(triggers)) {
            errors.push({ path: 'eventTriggers', message: 'eventTriggers must be an array if provided' });
            return;
        }
        for (let i = 0; i < triggers.length; i++) {
            const t = triggers[i];
            if (typeof t !== 'object' || t === null) {
                errors.push({ path: `eventTriggers[${i}]`, message: 'trigger must be a non-null object' });
                continue;
            }
            const trigger = t;
            if (typeof trigger['tick'] !== 'number' || trigger['tick'] < 0) {
                errors.push({ path: `eventTriggers[${i}].tick`, message: 'tick must be a non-negative number' });
            }
            if (typeof trigger['eventType'] !== 'string' || trigger['eventType'] === '') {
                errors.push({ path: `eventTriggers[${i}].eventType`, message: 'eventType is required and must be non-empty' });
            }
            if (trigger['parameters'] !== undefined && (typeof trigger['parameters'] !== 'object' || trigger['parameters'] === null)) {
                errors.push({ path: `eventTriggers[${i}].parameters`, message: 'parameters must be an object if provided' });
            }
        }
    }
}
//# sourceMappingURL=scenario.validator.js.map