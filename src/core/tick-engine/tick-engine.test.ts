import { describe, it, expect, vi } from 'vitest';
import { TickEngine } from './tick-engine.js';
import { EventBus } from '../event-bus/event-bus.js';
import { Timeline } from '../timeline/timeline.js';
import { WorldState } from '../world-state/world-state.js';
import { ISystem, SystemPriority } from '../interfaces/system.interface.js';
import { IWorldState } from '../interfaces/world-state.interface.js';
import { IEventBus } from '../interfaces/event-bus.interface.js';

function createSystem(
  id: string,
  priority: number,
  executeFn: (state: Readonly<IWorldState>, bus: IEventBus) => void = () => {},
): ISystem {
  return {
    descriptor: {
      id,
      name: id,
      priority: priority as SystemPriority,
      requiredComponents: [],
      subscribedEvents: [],
      emittedEvents: [],
    },
    execute: executeFn,
  };
}

function createEngine(config?: { snapshotInterval?: number; maxTicks?: number }) {
  const timeline = new Timeline();
  const eventBus = new EventBus(timeline);
  const worldState = new WorldState('test-scenario');
  const engine = new TickEngine(worldState, eventBus, timeline, config);
  return { engine, worldState, eventBus, timeline };
}

describe('TickEngine', () => {
  it('should execute systems in priority order', () => {
    const { engine } = createEngine();
    const order: string[] = [];

    engine.registerSystem(createSystem('third', 300, () => order.push('third')));
    engine.registerSystem(createSystem('first', 100, () => order.push('first')));
    engine.registerSystem(createSystem('second', 200, () => order.push('second')));

    engine.tick();
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('should increment tick number on each tick', () => {
    const { engine } = createEngine();
    expect(engine.getCurrentTick()).toBe(0);

    engine.tick();
    expect(engine.getCurrentTick()).toBe(1);

    engine.tick();
    expect(engine.getCurrentTick()).toBe(2);
  });

  it('should return correct ITickResult', () => {
    const { engine } = createEngine();
    engine.registerSystem(
      createSystem('emitter', 100, (_state, bus) => {
        bus.publish('test.event', { v: 1 }, 'emitter');
      }),
    );

    const result = engine.tick();
    expect(result.tick).toBe(1);
    expect(result.systemsExecuted).toBe(1);
    expect(result.eventsEmitted).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.snapshotCreated).toBe(false);
  });

  it('should flush events to Timeline after system execution', () => {
    const { engine, timeline } = createEngine();
    engine.registerSystem(
      createSystem('emitter', 100, (_state, bus) => {
        bus.publish('event.a', { a: 1 }, 'emitter');
        bus.publish('event.b', { b: 2 }, 'emitter');
      }),
    );

    engine.tick();
    expect(timeline.getEventCount()).toBe(2);
  });

  it('should fire lifecycle hooks', () => {
    const { engine } = createEngine();
    const onTickStart = vi.fn();
    const onTickEnd = vi.fn();
    const onSystemStart = vi.fn();
    const onSystemEnd = vi.fn();

    engine.setLifecycleHooks({ onTickStart, onTickEnd, onSystemStart, onSystemEnd });
    engine.registerSystem(createSystem('sys-1', 100));

    engine.tick();

    expect(onTickStart).toHaveBeenCalledWith(1);
    expect(onTickEnd).toHaveBeenCalledOnce();
    expect(onTickEnd.mock.calls[0]![0].tick).toBe(1);
    expect(onSystemStart).toHaveBeenCalledWith('sys-1', 1);
    expect(onSystemEnd).toHaveBeenCalledWith('sys-1', 1);
  });

  it('should create snapshot at configured interval', () => {
    const { engine } = createEngine({ snapshotInterval: 2 });
    engine.registerSystem(createSystem('noop', 100));

    const r1 = engine.tick(); // Tick 1
    const r2 = engine.tick(); // Tick 2
    const r3 = engine.tick(); // Tick 3
    const r4 = engine.tick(); // Tick 4

    expect(r1.snapshotCreated).toBe(false);
    expect(r2.snapshotCreated).toBe(true);
    expect(r3.snapshotCreated).toBe(false);
    expect(r4.snapshotCreated).toBe(true);
  });

  it('should run multiple ticks with runTicks', () => {
    const { engine } = createEngine();
    engine.registerSystem(createSystem('noop', 100));

    const results = engine.runTicks(5);
    expect(results).toHaveLength(5);
    expect(results[0]!.tick).toBe(1);
    expect(results[4]!.tick).toBe(5);
    expect(engine.getCurrentTick()).toBe(5);
  });

  it('should respect maxTicks limit in runTicks', () => {
    const { engine } = createEngine({ maxTicks: 3 });
    engine.registerSystem(createSystem('noop', 100));

    const results = engine.runTicks(10);
    expect(results).toHaveLength(3);
    expect(engine.getCurrentTick()).toBe(3);
  });

  it('should throw on duplicate system registration', () => {
    const { engine } = createEngine();
    engine.registerSystem(createSystem('sys-1', 100));

    expect(() => engine.registerSystem(createSystem('sys-1', 200))).toThrow(
      /already registered/,
    );
  });

  it('should throw on unregistering unknown system', () => {
    const { engine } = createEngine();

    expect(() => engine.unregisterSystem('unknown')).toThrow(/not registered/);
  });

  it('should call system initialize on registration', () => {
    const { engine, eventBus, worldState } = createEngine();
    const initFn = vi.fn();

    const system: ISystem = {
      ...createSystem('init-sys', 100),
      initialize: initFn,
    };

    engine.registerSystem(system);
    expect(initFn).toHaveBeenCalledWith(eventBus, worldState);
  });

  it('should call system teardown on unregistration', () => {
    const { engine } = createEngine();
    const teardownFn = vi.fn();

    const system: ISystem = {
      ...createSystem('teardown-sys', 100),
      teardown: teardownFn,
    };

    engine.registerSystem(system);
    engine.unregisterSystem('teardown-sys');
    expect(teardownFn).toHaveBeenCalledOnce();
  });

  it('should expose dependencies', () => {
    const { engine, worldState, eventBus, timeline } = createEngine();

    expect(engine.getWorldState()).toBe(worldState);
    expect(engine.getEventBus()).toBe(eventBus);
    expect(engine.getTimeline()).toBe(timeline);
  });
});
