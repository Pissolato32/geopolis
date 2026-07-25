import { DenseFormatter } from '../utils/dense-formatter.js';
import { bigintJsonReplacer, bigintJsonReviver } from '../utils/bigint-json.js';
import { Entity } from '../ecs/entity.js';
import { createHash } from 'node:crypto';
/**
 * Concrete World State implementation — entity registry with component indices.
 *
 * Read-only during system execution. Mutations are performed exclusively
 * during the Event Resolution phase of the Tick Engine.
 */
export class WorldState {
    entities = new Map();
    componentIndex = new Map();
    relationGraphIndex = new Map();
    currentTick = 0;
    lastModified = new Date().toISOString();
    scenarioId;
    constructor(scenarioId) {
        this.scenarioId = scenarioId;
    }
    // ─── Metadata ─────────────────────────────────────────────
    getMetadata() {
        return {
            currentTick: this.currentTick,
            entityCount: this.entities.size,
            lastModified: this.lastModified,
            scenarioId: this.scenarioId,
        };
    }
    /** @internal Update the current tick. Called by TickEngine. */
    setCurrentTick(tick) {
        this.currentTick = tick;
    }
    // ─── Entity Access ────────────────────────────────────────
    getEntity(id) {
        return this.entities.get(id);
    }
    hasEntity(id) {
        return this.entities.has(id);
    }
    getEntityIds() {
        return Array.from(this.entities.keys());
    }
    getEntitiesByComponent(componentType) {
        const entityIds = this.componentIndex.get(componentType);
        if (!entityIds)
            return [];
        const result = [];
        for (const id of entityIds) {
            const entity = this.entities.get(id);
            if (entity)
                result.push(entity);
        }
        return result;
    }
    getEntitiesByComponents(componentTypes) {
        if (componentTypes.length === 0)
            return [];
        // Start with the smallest index set for efficiency
        const sortedTypes = [...componentTypes].sort((a, b) => {
            const sizeA = this.componentIndex.get(a)?.size ?? 0;
            const sizeB = this.componentIndex.get(b)?.size ?? 0;
            return sizeA - sizeB;
        });
        const firstType = sortedTypes[0];
        const candidates = this.componentIndex.get(firstType);
        if (!candidates)
            return [];
        const result = [];
        for (const id of candidates) {
            const entity = this.entities.get(id);
            if (!entity)
                continue;
            const hasAll = sortedTypes.every((type) => entity.hasComponent(type));
            if (hasAll)
                result.push(entity);
        }
        return result;
    }
    getEntityCount() {
        return this.entities.size;
    }
    // ─── Mutation (Event Resolution Phase Only) ───────────────
    createEntity(id, components = []) {
        if (this.entities.has(id)) {
            throw new Error(`Entity "${id}" already exists`);
        }
        const entity = new Entity(id, components);
        this.entities.set(id, entity);
        // Index all initial components
        for (const component of components) {
            this.indexComponent(id, component.type);
        }
        this.markModified();
        return entity;
    }
    addComponent(entityId, component) {
        const entity = this.getEntityOrThrow(entityId);
        entity.attachComponent(component);
        this.indexComponent(entityId, component.type);
        this.maybeCreateMirrorRelation(entityId, component);
        this.markModified();
    }
    maybeCreateMirrorRelation(entityId, component) {
        if (component.type !== 'diplomacy.relation')
            return;
        const compObj = component;
        const targetId = compObj['targetCountryId'];
        if (typeof targetId !== 'string')
            return;
        if (!this.entities.has(targetId))
            return;
        const targetEntity = this.entities.get(targetId);
        if (targetEntity.hasComponent('diplomacy.relation'))
            return;
        const mirrorComponent = {
            type: 'diplomacy.relation',
            targetCountryId: entityId,
            affinity: compObj['affinity'] ?? 0,
            tension: compObj['tension'] ?? 0.5,
            recognition: compObj['recognition'] ?? 'full',
            activeTreaties: [],
        };
        targetEntity.attachComponent(mirrorComponent);
        this.indexComponent(targetId, mirrorComponent.type);
    }
    updateComponent(entityId, component) {
        const entity = this.getEntityOrThrow(entityId);
        entity.replaceComponent(component);
        this.markModified();
    }
    removeComponent(entityId, componentType) {
        const entity = this.getEntityOrThrow(entityId);
        entity.detachComponent(componentType);
        this.deindexComponent(entityId, componentType);
        this.markModified();
    }
    removeEntity(id) {
        const entity = this.getEntityOrThrow(id);
        // Remove from all component indices
        for (const type of entity.getComponentTypes()) {
            this.deindexComponent(id, type);
        }
        this.entities.delete(id);
        this.markModified();
    }
    // ─── Dense Serialization & Fog of War (ADR-001) ───────────
    dumpStateForAnalysis(options) {
        const focalEntity = this.entities.get(options.perspectiveEntityId);
        const intelComp = focalEntity?.getComponent('intel.agency');
        const intelObj = intelComp;
        const maxCapability = intelObj
            ? Math.max(intelObj['sigintCapability'] ?? 0, intelObj['humintCapability'] ?? 0, intelObj['osintCapability'] ?? 0, intelObj['imintCapability'] ?? 0, intelObj['cyberCapability'] ?? 0)
            : 0;
        const visibleRadius = maxCapability < 0.2 ? 1
            : maxCapability < 0.4 ? 2
                : maxCapability < 0.7 ? 3
                    : 4;
        const visibleEntities = this.computeVisibleEntities(options.perspectiveEntityId, visibleRadius);
        const lines = [
            `tick: ${this.currentTick}`,
            `scenario: ${this.scenarioId}`,
            `focal_entity: ${options.perspectiveEntityId}`,
        ];
        if (focalEntity) {
            lines.push(`focal_components:`);
            for (const [type, comp] of focalEntity.getComponentMap()) {
                lines.push(`  - type: ${type}`);
                if (type === 'Demographic') {
                    const dto = DenseFormatter.toDemographicViewDTO(comp);
                    lines.push(`    pop: "${dto.pop}"`);
                    lines.push(`    trend: "${dto.trend}"`);
                    lines.push(`    stability: "${dto.stability}"`);
                }
                else if (type === 'Economic') {
                    const dto = DenseFormatter.toEconomicViewDTO(comp);
                    lines.push(`    gdp: "${dto.gdp}"`);
                    lines.push(`    treasury: "${dto.treasury}"`);
                    lines.push(`    inflation: "${dto.inflation}"`);
                    lines.push(`    status: "${dto.status}"`);
                }
                else if (type === 'Military') {
                    const dto = DenseFormatter.toMilitaryViewDTO(comp);
                    lines.push(`    powerClass: "${dto.powerClass}"`);
                    lines.push(`    readiness: "${dto.readiness}"`);
                    lines.push(`    nukes: ${dto.nukes}`);
                }
                else {
                    for (const [k, v] of Object.entries(comp)) {
                        if (k === 'type')
                            continue;
                        lines.push(`    ${k}: ${typeof v === 'bigint' ? v.toString() : JSON.stringify(v, bigintJsonReplacer)}`);
                    }
                }
            }
            if (visibleEntities.length > 0) {
                lines.push(`visible_entities:`);
                for (const vid of visibleEntities) {
                    const ve = this.entities.get(vid);
                    if (!ve)
                        continue;
                    const rel = this.getRelation(options.perspectiveEntityId, vid);
                    const relInfo = rel
                        ? `affinity=${(rel['affinity'] ?? 0).toFixed(2)}`
                        : 'no_direct_relation';
                    lines.push(`  - id: ${vid} [${relInfo}]`);
                }
            }
        }
        lines.push(`visible_entities_count: ${visibleEntities.length}`);
        return lines.join('\n');
    }
    computeVisibleEntities(focalId, radius) {
        if (!this.entities.has(focalId))
            return [];
        const visited = new Set();
        const result = [];
        const queue = [{ id: focalId, depth: 0 }];
        visited.add(focalId);
        while (queue.length > 0) {
            const current = queue.shift();
            if (current.depth >= radius)
                continue;
            const relations = this.relationGraphIndex.get(current.id);
            if (!relations)
                continue;
            for (const neighborId of relations.keys()) {
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    result.push(neighborId);
                    queue.push({ id: neighborId, depth: current.depth + 1 });
                }
            }
        }
        return result;
    }
    // ─── Snapshot ─────────────────────────────────────────────
    createSnapshot() {
        const data = {};
        for (const [id, entity] of this.entities) {
            const componentData = {};
            for (const [type, component] of entity.getComponentMap()) {
                componentData[type] = { ...component };
            }
            data[id] = componentData;
        }
        const serialized = JSON.stringify(data, bigintJsonReplacer);
        const hash = createHash('sha256').update(serialized).digest('hex');
        return {
            tick: this.currentTick,
            createdAt: new Date().toISOString(),
            data,
            hash,
        };
    }
    restoreFromSnapshot(snapshot) {
        // Validate hash
        const serialized = JSON.stringify(snapshot.data, bigintJsonReplacer);
        const computedHash = createHash('sha256').update(serialized).digest('hex');
        if (computedHash !== snapshot.hash) {
            throw new Error('Snapshot integrity check failed: hash mismatch');
        }
        // Clear current state
        this.entities.clear();
        this.componentIndex.clear();
        this.relationGraphIndex.clear();
        // Rehydrate JSON data using BigInt reviver
        const rehydratedData = JSON.parse(JSON.stringify(snapshot.data, bigintJsonReplacer), bigintJsonReviver);
        // Restore entities and components
        for (const [entityId, componentData] of Object.entries(rehydratedData)) {
            const components = [];
            for (const component of Object.values(componentData)) {
                components.push(component);
            }
            this.createEntity(entityId, components);
        }
        this.currentTick = snapshot.tick;
        this.markModified();
    }
    getRelation(sourceId, targetId) {
        return this.relationGraphIndex.get(sourceId)?.get(targetId);
    }
    // ─── Private Helpers ──────────────────────────────────────
    getEntityOrThrow(id) {
        const entity = this.entities.get(id);
        if (!entity) {
            throw new Error(`Entity "${id}" does not exist`);
        }
        return entity;
    }
    indexComponent(entityId, type) {
        let index = this.componentIndex.get(type);
        if (!index) {
            index = new Set();
            this.componentIndex.set(type, index);
        }
        index.add(entityId);
        // Update relationGraphIndex for O(1) relation queries
        if (type === 'diplomacy.relation') {
            const entity = this.entities.get(entityId);
            const comp = entity?.getComponent('diplomacy.relation');
            const compObj = comp;
            if (comp && compObj && typeof compObj['targetCountryId'] === 'string') {
                const targetId = compObj['targetCountryId'];
                let sourceMap = this.relationGraphIndex.get(entityId);
                if (!sourceMap) {
                    sourceMap = new Map();
                    this.relationGraphIndex.set(entityId, sourceMap);
                }
                sourceMap.set(targetId, comp);
            }
        }
    }
    deindexComponent(entityId, type) {
        const index = this.componentIndex.get(type);
        if (index) {
            index.delete(entityId);
            if (index.size === 0) {
                this.componentIndex.delete(type);
            }
        }
        if (type === 'diplomacy.relation') {
            this.relationGraphIndex.delete(entityId);
        }
    }
    markModified() {
        this.lastModified = new Date().toISOString();
    }
}
//# sourceMappingURL=world-state.js.map