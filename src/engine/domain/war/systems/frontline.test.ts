import { describe, it, expect } from 'vitest';
import { WorldState } from '../../../core/world-state/world-state.js';
import { EventBus } from '../../../core/event-bus/event-bus.js';
import { Timeline } from '../../../core/timeline/timeline.js';
import { TickEngine } from '../../../core/tick-engine/tick-engine.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  MILITARY_UNIT_TYPE,
} from '../components/war.components.js';
import {
  PROVINCE_TYPE,
  FRONTLINE_TYPE,
  FrontlineComponent,
} from '../components/province.components.js';
import {
  DIPLOMATIC_RELATION_TYPE,
} from '../../diplomacy/components/relation.component.js';
import { makeProvince } from '../test-utils.js';
import { FrontlineSystem } from './frontline.system.js';
import { WAR_FRONTLINE_SHIFTED_EVENT } from '../events/war-terrain.events.js';
describe('FrontlineSystem', () => {
  it('should detect a frontline when hostile units share a province', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('frontline-test');
    const engine = new TickEngine(worldState, eventBus, timeline);
    const countryA = 'country-a' as EntityId;
    const countryB = 'country-b' as EntityId;
    worldState.createEntity(countryA, [{
      type: PROVINCE_TYPE,
      provinces: [makeProvince('prov-a1', countryA, ['prov-b1'])],
    } as unknown as IComponent, {
      type: DIPLOMATIC_RELATION_TYPE,
      sourceCountryId: countryA,
      targetCountryId: countryB,
      affinity: -0.6,
      tension: 0.8,
      recognition: 'full' as const,
      activeTreaties: [],
    } as unknown as IComponent]);
    worldState.createEntity(countryB, [{
      type: PROVINCE_TYPE,
      provinces: [makeProvince('prov-b1', countryB, ['prov-a1'])],
    } as unknown as IComponent]);
    worldState.createEntity('unit-a1' as EntityId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryA,
      unitName: 'Alpha',
      personnel: 10000,
      readiness: 0.8,
      morale: 0.8,
      fuelReserves: 50,
      currentProvinceId: 'prov-b1',
    } as unknown as IComponent]);
    worldState.createEntity('unit-b1' as EntityId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryB,
      unitName: 'Bravo',
      personnel: 8000,
      readiness: 0.7,
      morale: 0.7,
      fuelReserves: 50,
      currentProvinceId: 'prov-b1',
    } as unknown as IComponent]);
    engine.registerSystem(new FrontlineSystem());
    engine.tick();
    const shiftedEvents = timeline.query({ eventType: WAR_FRONTLINE_SHIFTED_EVENT });
    expect(shiftedEvents.length).toBeGreaterThanOrEqual(1);
    const frontlineEntity = worldState.getEntity('frontline-global' as EntityId);
    expect(frontlineEntity).toBeDefined();
    const flComp = frontlineEntity?.getComponent<FrontlineComponent>(FRONTLINE_TYPE);
    expect(flComp).toBeDefined();
    expect(flComp!.segments.length).toBeGreaterThanOrEqual(1);
    expect(flComp!.segments[0]!.countryA).toBe(countryA);
    expect(flComp!.segments[0]!.countryB).toBe(countryB);
  });
  it('should not create a frontline when relations are peaceful', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('frontline-peace-test');
    const engine = new TickEngine(worldState, eventBus, timeline);
    const countryA = 'country-a' as EntityId;
    const countryB = 'country-b' as EntityId;
    worldState.createEntity(countryA, [{
      type: PROVINCE_TYPE,
      provinces: [makeProvince('prov-shared', countryA, [])],
    } as unknown as IComponent, {
      type: DIPLOMATIC_RELATION_TYPE,
      sourceCountryId: countryA,
      targetCountryId: countryB,
      affinity: 0.5,
      tension: 0.1,
      recognition: 'full' as const,
      activeTreaties: [],
    } as unknown as IComponent]);
    worldState.createEntity('unit-a1' as EntityId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryA,
      unitName: 'Alpha',
      personnel: 10000,
      readiness: 0.8,
      morale: 0.8,
      fuelReserves: 50,
      currentProvinceId: 'prov-shared',
    } as unknown as IComponent]);
    worldState.createEntity('unit-b1' as EntityId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryB,
      unitName: 'Bravo',
      personnel: 8000,
      readiness: 0.7,
      morale: 0.7,
      fuelReserves: 50,
      currentProvinceId: 'prov-shared',
    } as unknown as IComponent]);
    engine.registerSystem(new FrontlineSystem());
    engine.tick();
    const shiftedEvents = timeline.query({ eventType: WAR_FRONTLINE_SHIFTED_EVENT });
    expect(shiftedEvents).toHaveLength(0);
    const flEntity = worldState.getEntity('frontline-global' as EntityId);
    const flComp = flEntity?.getComponent<FrontlineComponent>(FRONTLINE_TYPE);
    expect(flComp).toBeDefined();
    expect(flComp!.segments).toHaveLength(0);
  });
});
