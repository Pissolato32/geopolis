import { describe, it, expect } from 'vitest';
import { TickEngine } from './tick-engine/tick-engine.js';
import { EventBus } from './event-bus/event-bus.js';
import { Timeline } from './timeline/timeline.js';
import { WorldState } from './world-state/world-state.js';
import { ISystem } from './interfaces/system.interface.js';
import { IWorldState } from './interfaces/world-state.interface.js';
import { IEventBus, ITypedEvent } from './interfaces/event-bus.interface.js';
import { ComponentType, IComponent } from './interfaces/component.interface.js';
import { EntityId } from './interfaces/entity.interface.js';
import { SystemPriority } from './interfaces/system.interface.js';

/**
 * Integration test: 5-tick simulation with a CounterSystem.
 *
 * Scenario:
 * - One entity ("counter-entity") with a CounterComponent { count: 0 }
 * - A CounterSystem reads the counter and emits a "counter.incremented" event
 * - An event handler applies the increment to WorldState
 * - After 5 ticks: counter should be 5, Timeline should have 5 events
 */

const COUNTER_TYPE = 'counter' as ComponentType;

interface CounterComponent extends IComponent {
  readonly type: ComponentType;
  readonly count: number;
}

interface CounterIncrementedPayload {
  readonly entityId: string;
  readonly previousCount: number;
  readonly newCount: number;
}

const counterSystem: ISystem = {
  descriptor: {
    id: 'counter.increment',
    name: 'Counter Increment System',
    priority: 100 as SystemPriority,
    requiredComponents: [COUNTER_TYPE],
    subscribedEvents: [],
    emittedEvents: ['counter.incremented'],
  },
  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const entities = state.getEntitiesByComponent(COUNTER_TYPE);

    for (const entity of entities) {
      const counter = entity.getComponent<CounterComponent>(COUNTER_TYPE);
      if (!counter) continue;

      const newCount = counter.count + 1;

      eventBus.publish<CounterIncrementedPayload>(
        'counter.incremented',
        {
          entityId: entity.id,
          previousCount: counter.count,
          newCount,
        },
        'counter.increment',
        entity.id,
      );
    }
  },
};

describe('Integration: 5-Tick Counter Simulation', () => {
  it('should increment counter across 5 ticks with full event trail', () => {
    // Setup
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('integration-test');
    const engine = new TickEngine(worldState, eventBus, timeline, {
      snapshotInterval: 3, // Snapshot at tick 3
    });

    // Create entity with counter
    const entityId = 'counter-entity' as EntityId;
    worldState.createEntity(entityId, [
      { type: COUNTER_TYPE, count: 0 } as CounterComponent,
    ]);

    // Register event handler that applies increments to WorldState
    eventBus.subscribe<CounterIncrementedPayload>(
      'counter.incremented',
      (event) => {
        worldState.updateComponent(event.payload.entityId as EntityId, {
          type: COUNTER_TYPE,
          count: event.payload.newCount,
        } as CounterComponent);
      },
    );

    // Register system
    engine.registerSystem(counterSystem);

    // Run 5 ticks
    const results = engine.runTicks(5);

    // ─── Assertions ─────────────────────────────────────────

    // 5 ticks executed
    expect(results).toHaveLength(5);

    // Each tick emitted exactly 1 event
    for (const result of results) {
      expect(result.eventsEmitted).toBe(1);
      expect(result.systemsExecuted).toBe(1);
    }

    // Ticks are sequential
    expect(results.map((r) => r.tick)).toEqual([1, 2, 3, 4, 5]);

    // Counter is now 5
    const entity = worldState.getEntity(entityId);
    expect(entity).toBeDefined();
    const counter = entity!.getComponent<CounterComponent>(COUNTER_TYPE);
    expect(counter!.count).toBe(5);

    // Timeline has 5 events
    expect(timeline.getEventCount()).toBe(5);

    // All events are "counter.incremented"
    const allEvents = timeline.query({ eventType: 'counter.incremented' });
    expect(allEvents).toHaveLength(5);

    // Events have correct payload progression
    for (let i = 0; i < 5; i++) {
      const entry = allEvents[i]!;
      const payload = (entry.event as ITypedEvent<CounterIncrementedPayload>).payload;
      expect(payload.previousCount).toBe(i);
      expect(payload.newCount).toBe(i + 1);
      expect(entry.event.tick).toBe(i + 1);
    }

    // Snapshot was created at tick 3
    expect(results[2]!.snapshotCreated).toBe(true);
    expect(results[0]!.snapshotCreated).toBe(false);

    // Engine state is consistent
    expect(engine.getCurrentTick()).toBe(5);
    expect(timeline.getLatestTick()).toBe(5);
  });
});
