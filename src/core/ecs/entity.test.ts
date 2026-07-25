import { describe, it, expect } from 'vitest';
import { Entity } from './entity.js';
import { ComponentType, IComponent } from '../interfaces/component.interface.js';
import { EntityId } from '../interfaces/entity.interface.js';

const HEALTH_TYPE = 'health' as ComponentType;
const POSITION_TYPE = 'position' as ComponentType;
const MISSING_TYPE = 'missing' as ComponentType;

interface HealthComponent extends IComponent {
  hp: number;
}

interface PositionComponent extends IComponent {
  x: number;
  y: number;
}

function createEntityId(name: string): EntityId {
  return name as EntityId;
}

describe('Entity', () => {
  it('should store id immutably', () => {
    const id = createEntityId('e-1');
    const entity = new Entity(id);
    expect(entity.id).toBe(id);
  });

  it('should initialize with components', () => {
    const healthComp: HealthComponent = { type: HEALTH_TYPE, hp: 100 };
    const posComp: PositionComponent = { type: POSITION_TYPE, x: 0, y: 0 };
    const entity = new Entity(createEntityId('e-1'), [healthComp, posComp]);

    expect(entity.hasComponent(HEALTH_TYPE)).toBe(true);
    expect(entity.hasComponent(POSITION_TYPE)).toBe(true);
    expect(entity.getComponentTypes()).toHaveLength(2);
  });

  it('should return undefined for missing component', () => {
    const entity = new Entity(createEntityId('e-1'));
    expect(entity.getComponent(MISSING_TYPE)).toBeUndefined();
  });

  it('should retrieve component by type', () => {
    const healthComp: HealthComponent = { type: HEALTH_TYPE, hp: 100 };
    const entity = new Entity(createEntityId('e-1'), [healthComp]);

    const retrieved = entity.getComponent<HealthComponent>(HEALTH_TYPE);
    expect(retrieved).toEqual(healthComp);
  });

  it('should attach component via internal method', () => {
    const entity = new Entity(createEntityId('e-1'));
    const healthComp: HealthComponent = { type: HEALTH_TYPE, hp: 50 };
    entity.attachComponent(healthComp);

    expect(entity.hasComponent(HEALTH_TYPE)).toBe(true);
  });

  it('should throw on duplicate attachComponent', () => {
    const healthComp100: HealthComponent = { type: HEALTH_TYPE, hp: 100 };
    const healthComp50: HealthComponent = { type: HEALTH_TYPE, hp: 50 };
    const entity = new Entity(createEntityId('e-1'), [healthComp100]);

    expect(() => {
      entity.attachComponent(healthComp50);
    }).toThrow(/already has component/);
  });

  it('should replace component via internal method', () => {
    const healthComp100: HealthComponent = { type: HEALTH_TYPE, hp: 100 };
    const healthComp50: HealthComponent = { type: HEALTH_TYPE, hp: 50 };
    const entity = new Entity(createEntityId('e-1'), [healthComp100]);

    entity.replaceComponent(healthComp50);
    const comp = entity.getComponent<HealthComponent>(HEALTH_TYPE);
    expect(comp?.hp).toBe(50);
  });

  it('should throw on replaceComponent for missing type', () => {
    const entity = new Entity(createEntityId('e-1'));
    const healthComp: HealthComponent = { type: HEALTH_TYPE, hp: 50 };

    expect(() => {
      entity.replaceComponent(healthComp);
    }).toThrow(/does not have component/);
  });

  it('should detach component via internal method', () => {
    const healthComp: HealthComponent = { type: HEALTH_TYPE, hp: 100 };
    const entity = new Entity(createEntityId('e-1'), [healthComp]);

    entity.detachComponent(HEALTH_TYPE);
    expect(entity.hasComponent(HEALTH_TYPE)).toBe(false);
    expect(entity.getComponentTypes()).toHaveLength(0);
  });

  it('should throw on detachComponent for missing type', () => {
    const entity = new Entity(createEntityId('e-1'));

    expect(() => {
      entity.detachComponent(MISSING_TYPE);
    }).toThrow(/does not have component/);
  });

  it('should expose readonly component map', () => {
    const healthComp: HealthComponent = { type: HEALTH_TYPE, hp: 100 };
    const entity = new Entity(createEntityId('e-1'), [healthComp]);

    const map = entity.getComponentMap();
    expect(map.size).toBe(1);
    expect(map.get(HEALTH_TYPE)).toBeDefined();
  });
});
