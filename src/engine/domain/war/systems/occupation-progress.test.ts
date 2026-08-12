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
  ProvinceData,
  ProvinceComponent,
} from '../components/province.components.js';
import { makeProvince } from '../test-utils.js';
import { OccupationProgressSystem } from './occupation-progress.system.js';
import {
  WAR_OCCUPATION_PROGRESS_EVENT,
  WAR_PROVINCE_CONTESTED_EVENT,
} from '../events/war-terrain.events.js';
import { WAR_PROVINCE_CAPTURED_EVENT } from '../events/war.events.js';


describe('OccupationProgressSystem', () => {
  it('should begin occupation progress when a foreign unit garrisons an enemy province', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('occ-progress-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryA = 'country-a' as EntityId;
    const countryB = 'country-b' as EntityId;

    worldState.createEntity(countryB, [{
      type: PROVINCE_TYPE,
      provinces: [makeProvince('prov-b1', countryB, ['prov-b2'])],
    } as unknown as IComponent]);

    worldState.createEntity('unit-a1' as EntityId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryA,
      unitName: 'Occupier',
      personnel: 5000,
      readiness: 0.8,
      morale: 0.8,
      fuelReserves: 50,
      currentProvinceId: 'prov-b1',
    } as unknown as IComponent]);

    engine.registerSystem(new OccupationProgressSystem());
    engine.tick();

    const contestedEvents = timeline.query({ eventType: WAR_PROVINCE_CONTESTED_EVENT });
    expect(contestedEvents).toHaveLength(1);

    const progressEvents = timeline.query({ eventType: WAR_OCCUPATION_PROGRESS_EVENT });
    expect(progressEvents).toHaveLength(1);
    expect(((progressEvents[0]!.event as unknown as { payload: { progress: number } }).payload).progress).toBe(25);

    const bEntity = worldState.getEntity(countryB);
    const provComp = bEntity?.getComponent<ProvinceComponent>(PROVINCE_TYPE);
    const prov = (provComp!.provinces as ReadonlyArray<ProvinceData>)[0]!;
    expect(prov.occupationProgress).toBe(25);
    expect(prov.occupyingCountryId).toBe(countryA);
  });

  it('should complete occupation and transfer province ownership after 4 ticks', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('occ-complete-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryA = 'country-a' as EntityId;
    const countryB = 'country-b' as EntityId;

    worldState.createEntity(countryA, [{
      type: PROVINCE_TYPE,
      provinces: [],
    } as unknown as IComponent]);

    worldState.createEntity(countryB, [{
      type: PROVINCE_TYPE,
      provinces: [makeProvince('prov-b1', countryB, [])],
    } as unknown as IComponent]);

    worldState.createEntity('unit-a1' as EntityId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryA,
      unitName: 'Occupier',
      personnel: 5000,
      readiness: 0.8,
      morale: 0.8,
      fuelReserves: 100,
      currentProvinceId: 'prov-b1',
    } as unknown as IComponent]);

    engine.registerSystem(new OccupationProgressSystem());

    engine.runTicks(4);

    const capturedEvents = timeline.query({ eventType: WAR_PROVINCE_CAPTURED_EVENT });
    expect(capturedEvents.length).toBeGreaterThanOrEqual(1);

    const bEntity = worldState.getEntity(countryB);
    const bProvComp = bEntity?.getComponent<ProvinceComponent>(PROVINCE_TYPE);
    expect((bProvComp!.provinces as ReadonlyArray<ProvinceData>).length).toBe(0);

    const aEntity = worldState.getEntity(countryA);
    const aProvComp = aEntity?.getComponent<ProvinceComponent>(PROVINCE_TYPE);
    expect(aProvComp).toBeDefined();
    expect((aProvComp!.provinces as ReadonlyArray<ProvinceData>).length).toBe(1);
    expect((aProvComp!.provinces as ReadonlyArray<ProvinceData>)[0]!.provinceId).toBe('prov-b1');
  });

  it('should decay occupation progress when the owner recaptures with superior garrison', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('occ-decay-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    const countryA = 'country-a' as EntityId;
    const countryB = 'country-b' as EntityId;

    worldState.createEntity(countryB, [{
      type: PROVINCE_TYPE,
      provinces: [{
        ...makeProvince('prov-b1', countryB, []),
        occupationProgress: 75,
        occupyingCountryId: countryA,
      }],
    } as unknown as IComponent]);

    worldState.createEntity('unit-a1' as EntityId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryA,
      unitName: 'Weak Occupier',
      personnel: 2000,
      readiness: 0.5,
      morale: 0.5,
      fuelReserves: 30,
      currentProvinceId: 'prov-b1',
    } as unknown as IComponent]);

    worldState.createEntity('unit-b1' as EntityId, [{
      type: MILITARY_UNIT_TYPE,
      ownerCountryId: countryB,
      unitName: 'Liberator',
      personnel: 10000,
      readiness: 0.9,
      morale: 0.9,
      fuelReserves: 50,
      currentProvinceId: 'prov-b1',
    } as unknown as IComponent]);

    engine.registerSystem(new OccupationProgressSystem());
    engine.tick();

    const bEntity = worldState.getEntity(countryB);
    const provComp = bEntity?.getComponent<ProvinceComponent>(PROVINCE_TYPE);
    const prov = (provComp!.provinces as ReadonlyArray<ProvinceData>)[0]!;
    expect(prov.occupationProgress).toBeLessThan(75);
  });
});
