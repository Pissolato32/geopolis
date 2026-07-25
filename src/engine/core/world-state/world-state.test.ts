import { describe, it, expect } from 'vitest';
import { WorldState } from './world-state.js';
import { ComponentType, IComponent } from '../interfaces/component.interface.js';
import { EntityId } from '../interfaces/entity.interface.js';
import { TickNumber } from '../interfaces/event-bus.interface.js';

const ECONOMY_TYPE = 'economy' as ComponentType;
const MILITARY_TYPE = 'military' as ComponentType;
const POLITICS_TYPE = 'politics' as ComponentType;

interface MockEconomyComponent extends IComponent {
  gdp?: number;
}

interface MockMilitaryComponent extends IComponent {
  strength?: number;
}

interface MockRelationComponent extends IComponent {
  targetCountryId?: EntityId;
  affinity?: number;
  tension?: number;
}

function id(name: string): EntityId {
  return name as EntityId;
}

describe('WorldState', () => {
  it('should create entity with initial components', () => {
    const state = new WorldState('test-scenario');
    const entity = state.createEntity(id('br'), [
      { type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent,
      { type: MILITARY_TYPE, strength: 500 } as MockMilitaryComponent,
    ]);

    expect(entity.id).toBe('br');
    expect(entity.hasComponent(ECONOMY_TYPE)).toBe(true);
    expect(entity.hasComponent(MILITARY_TYPE)).toBe(true);
    expect(state.getEntityCount()).toBe(1);
  });

  it('should throw on duplicate entity creation', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), []);

    expect(() => state.createEntity(id('br'), [])).toThrow(/already exists/);
  });

  it('should retrieve entity by ID', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), []);

    expect(state.getEntity(id('br'))).toBeDefined();
    expect(state.getEntity(id('unknown'))).toBeUndefined();
    expect(state.hasEntity(id('br'))).toBe(true);
    expect(state.hasEntity(id('unknown'))).toBe(false);
  });

  it('should query entities by component type', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), [{ type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent]);
    state.createEntity(id('us'), [
      { type: ECONOMY_TYPE, gdp: 25000 } as MockEconomyComponent,
      { type: MILITARY_TYPE, strength: 2000 } as MockMilitaryComponent,
    ]);
    state.createEntity(id('ch'), [{ type: MILITARY_TYPE, strength: 3000 } as MockMilitaryComponent]);

    const withEconomy = state.getEntitiesByComponent(ECONOMY_TYPE);
    expect(withEconomy).toHaveLength(2);

    const withMilitary = state.getEntitiesByComponent(MILITARY_TYPE);
    expect(withMilitary).toHaveLength(2);
  });

  it('should query entities by multiple component types', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), [{ type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent]);
    state.createEntity(id('us'), [
      { type: ECONOMY_TYPE, gdp: 25000 } as MockEconomyComponent,
      { type: MILITARY_TYPE, strength: 2000 } as MockMilitaryComponent,
    ]);

    const both = state.getEntitiesByComponents([ECONOMY_TYPE, MILITARY_TYPE]);
    expect(both).toHaveLength(1);
    expect(both[0]!.id).toBe('us');
  });

  it('should return empty for queries on nonexistent component type', () => {
    const state = new WorldState('test-scenario');
    const results = state.getEntitiesByComponent(POLITICS_TYPE);
    expect(results).toHaveLength(0);
  });

  it('should add component to existing entity', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), []);
    state.addComponent(id('br'), { type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent);

    const entity = state.getEntity(id('br'));
    expect(entity!.hasComponent(ECONOMY_TYPE)).toBe(true);

    // Index should be updated
    const withEconomy = state.getEntitiesByComponent(ECONOMY_TYPE);
    expect(withEconomy).toHaveLength(1);
  });

  it('should update component on entity', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), [{ type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent]);
    state.updateComponent(id('br'), { type: ECONOMY_TYPE, gdp: 2500 } as MockEconomyComponent);

    const entity = state.getEntity(id('br'));
    const comp = entity!.getComponent<MockEconomyComponent>(ECONOMY_TYPE);
    expect(comp!.gdp).toBe(2500);
  });

  it('should remove component from entity', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), [{ type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent]);
    state.removeComponent(id('br'), ECONOMY_TYPE);

    const entity = state.getEntity(id('br'));
    expect(entity!.hasComponent(ECONOMY_TYPE)).toBe(false);

    // Index should be cleaned
    expect(state.getEntitiesByComponent(ECONOMY_TYPE)).toHaveLength(0);
  });

  it('should remove entity and clean indices', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), [
      { type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent,
      { type: MILITARY_TYPE, strength: 500 } as MockMilitaryComponent,
    ]);
    state.removeEntity(id('br'));

    expect(state.hasEntity(id('br'))).toBe(false);
    expect(state.getEntityCount()).toBe(0);
    expect(state.getEntitiesByComponent(ECONOMY_TYPE)).toHaveLength(0);
    expect(state.getEntitiesByComponent(MILITARY_TYPE)).toHaveLength(0);
  });

  it('should throw on operations with missing entity', () => {
    const state = new WorldState('test-scenario');

    expect(() => state.addComponent(id('missing'), { type: ECONOMY_TYPE })).toThrow(/does not exist/);
    expect(() => state.updateComponent(id('missing'), { type: ECONOMY_TYPE })).toThrow(/does not exist/);
    expect(() => state.removeComponent(id('missing'), ECONOMY_TYPE)).toThrow(/does not exist/);
    expect(() => state.removeEntity(id('missing'))).toThrow(/does not exist/);
  });

  it('should provide correct metadata', () => {
    const state = new WorldState('cold-war');
    state.setCurrentTick(5 as TickNumber);
    state.createEntity(id('br'), []);
    state.createEntity(id('us'), []);

    const meta = state.getMetadata();
    expect(meta.scenarioId).toBe('cold-war');
    expect(meta.currentTick).toBe(5);
    expect(meta.entityCount).toBe(2);
    expect(meta.lastModified).toBeDefined();
  });

  it('should create and restore snapshot', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), [
      { type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent,
    ]);
    state.createEntity(id('us'), [
      { type: ECONOMY_TYPE, gdp: 25000 } as MockEconomyComponent,
      { type: MILITARY_TYPE, strength: 2000 } as MockMilitaryComponent,
    ]);

    const snapshot = state.createSnapshot();

    // Modify state after snapshot
    state.removeEntity(id('br'));
    expect(state.getEntityCount()).toBe(1);

    // Restore
    state.restoreFromSnapshot(snapshot);
    expect(state.getEntityCount()).toBe(2);
    expect(state.hasEntity(id('br'))).toBe(true);
    expect(state.hasEntity(id('us'))).toBe(true);

    // Component indices should be rebuilt
    expect(state.getEntitiesByComponent(ECONOMY_TYPE)).toHaveLength(2);
    expect(state.getEntitiesByComponent(MILITARY_TYPE)).toHaveLength(1);
  });

  it('should reject corrupted snapshot', () => {
    const state = new WorldState('test-scenario');
    state.createEntity(id('br'), [{ type: ECONOMY_TYPE, gdp: 2000 } as MockEconomyComponent]);

    const snapshot = state.createSnapshot();
    const corrupted = { ...snapshot, hash: 'invalid-hash' };

    expect(() => state.restoreFromSnapshot(corrupted)).toThrow(/hash mismatch/);
  });

  it('should generate dense YAML state dump via dumpStateForAnalysis (ADR-001)', () => {
    const state = new WorldState('world-2026');
    state.createEntity(id('br'), [{ type: ECONOMY_TYPE, gdp: 2100 } as MockEconomyComponent]);

    const dump = state.dumpStateForAnalysis({
      perspectiveEntityId: id('br'),
      formatYaml: true,
    });

    expect(dump).toContain('scenario: world-2026');
    expect(dump).toContain('focal_entity: br');
    expect(dump).toContain('gdp: 2100');
  });

  it('should maintain relationGraphIndex for O(1) getRelation queries', () => {
    const state = new WorldState('relation-test');
    state.createEntity(id('br'), [
      {
        type: 'diplomacy.relation',
        targetCountryId: id('us'),
        affinity: 0.8,
        tension: 0.1,
      } as MockRelationComponent,
    ]);

    const rel = state.getRelation(id('br'), id('us'));
    expect(rel).toBeDefined();
    expect((rel as unknown as Record<string, number>)['affinity']).toBe(0.8);

    expect(state.getRelation(id('br'), id('ar'))).toBeUndefined();
  });
});
