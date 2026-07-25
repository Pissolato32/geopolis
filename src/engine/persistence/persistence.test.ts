import { describe, it, expect } from 'vitest';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { SaveGameSerializer } from './serializer.js';
import { TimelineArchiver } from './timeline-archiver.js';
import { EconomySystem } from '../domain/economy/systems/economy.system.js';
import { EntityId } from '../core/interfaces/entity.interface.js';
import { ECONOMIC_INDICATOR_TYPE } from '../domain/economy/components/economy.components.js';

describe('Phase 4: Persistence & State Serialization (ADR-001 / ADR-002)', () => {
  it('should create a valid save game payload with SHA-256 integrity hash', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('save-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    worldState.createEntity('country-br' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 2170n,
        inflationRate: 0.04,
        treasury: 340n,
        taxRate: 0.22,
      },
    ]);

    engine.tick(); // Tick 1

    const savePayload = SaveGameSerializer.createSaveGame(engine);

    expect(savePayload.version).toBe('1.0.0');
    expect(savePayload.tick).toBe(1);
    expect(savePayload.scenarioId).toBe('save-test');
    expect(savePayload.payloadHash).toHaveLength(64); // SHA-256 hex string
    expect(savePayload.worldStateSnapshot).toBeDefined();
  });

  it('should reject corrupted save game payloads (Fail Fast hash validation)', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);
    const worldState = new WorldState('corrupt-test');
    const engine = new TickEngine(worldState, eventBus, timeline);

    engine.tick();
    const savePayload = SaveGameSerializer.createSaveGame(engine);

    const corruptedPayload = {
      ...savePayload,
      payloadHash: '0000000000000000000000000000000000000000000000000000000000000000',
    };

    expect(() => SaveGameSerializer.rehydrateEngine(corruptedPayload)).toThrowError(
      /Save game integrity check failed/,
    );
  });

  it('should rehydrate engine with systems and resume simulation seamlessly across ticks', () => {
    const timeline1 = new Timeline();
    const eventBus1 = new EventBus(timeline1);
    const worldState1 = new WorldState('rehydrate-test');
    const econSystem = new EconomySystem();
    const engine1 = new TickEngine(worldState1, eventBus1, timeline1);
    engine1.registerSystem(econSystem);

    worldState1.createEntity('country-us' as EntityId, [
      {
        type: ECONOMIC_INDICATOR_TYPE,
        gdp: 25000n,
        inflationRate: 0.03,
        treasury: 1000n,
        taxRate: 0.2,
      },
    ]);

    // Run 5 ticks on engine 1
    for (let i = 0; i < 5; i++) {
      engine1.tick();
    }

    // Save at Tick 5
    const savePayload = SaveGameSerializer.createSaveGame(engine1);
    expect(savePayload.tick).toBe(5);

    // Rehydrate on fresh engine instance
    const rehydrated = SaveGameSerializer.rehydrateEngine(savePayload, [new EconomySystem()]);

    expect(rehydrated.tickEngine.getCurrentTick()).toBe(5);
    expect(rehydrated.worldState.hasEntity('country-us' as EntityId)).toBe(true);

    // Run ticks 6 to 10 on rehydrated engine
    for (let i = 0; i < 5; i++) {
      rehydrated.tickEngine.tick();
    }

    expect(rehydrated.tickEngine.getCurrentTick()).toBe(10);
  });

  it('should export cold Timeline event segments in JSONL format via TimelineArchiver', () => {
    const timeline = new Timeline();
    const eventBus = new EventBus(timeline);

    eventBus.publish('test.event1', { a: 1 }, 'sys1');
    eventBus.publish('test.event2', { b: 2 }, 'sys2');
    eventBus.flush();

    const jsonl = TimelineArchiver.archiveEventsToJsonl(timeline);

    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);

    const parsed1 = JSON.parse(lines[0]!);
    expect(parsed1.event.type).toBe('test.event1');
  });
});
