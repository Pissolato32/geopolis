import { describe, it, expect } from 'vitest';
import { Timeline } from './timeline.js';
import { ISimulationEvent, ITypedEvent, EventId, TickNumber } from '../interfaces/event-bus.interface.js';
import { EntityId } from '../interfaces/entity.interface.js';

function createEvent(overrides: Partial<ISimulationEvent> = {}): ISimulationEvent {
  const evt: ISimulationEvent = {
    id: (overrides.id ?? `evt-${Math.random()}`) as EventId,
    type: overrides.type ?? 'test.event',
    tick: overrides.tick ?? (1 as TickNumber),
    sourceSystem: overrides.sourceSystem ?? 'test-system',
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    ...(overrides.entityId !== undefined ? { entityId: overrides.entityId } : {}),
  };
  return evt;
}

function createTypedEvent<T>(payload: T, overrides: Partial<ISimulationEvent> = {}): ITypedEvent<T> {
  return {
    ...createEvent(overrides),
    payload,
  };
}

describe('Timeline', () => {
  it('should record events and assign sequence IDs', () => {
    const timeline = new Timeline();
    const e1 = timeline.record(createEvent({ tick: 1 as TickNumber }));
    const e2 = timeline.record(createEvent({ tick: 1 as TickNumber }));

    expect(e1.sequenceId).toBe(0);
    expect(e2.sequenceId).toBe(1);
    expect(timeline.getEventCount()).toBe(2);
  });

  it('should reset sequence counter on new tick', () => {
    const timeline = new Timeline();
    timeline.record(createEvent({ tick: 1 as TickNumber }));
    timeline.record(createEvent({ tick: 1 as TickNumber }));
    const e3 = timeline.record(createEvent({ tick: 2 as TickNumber }));

    expect(e3.sequenceId).toBe(0); // Reset for tick 2
  });

  it('should compute payload hash', () => {
    const timeline = new Timeline();
    const entry = timeline.record(createTypedEvent({ value: 42 }));

    expect(entry.payloadHash).toBeDefined();
    expect(entry.payloadHash.length).toBe(64); // SHA-256 hex
  });

  it('should retrieve by event ID', () => {
    const timeline = new Timeline();
    const eventId = 'evt-lookup' as EventId;
    const event = createEvent({ id: eventId });
    timeline.record(event);

    const found = timeline.getById(eventId);
    expect(found).toBeDefined();
    expect(found!.event.id).toBe(eventId);
  });

  it('should return undefined for unknown event ID', () => {
    const timeline = new Timeline();
    expect(timeline.getById('unknown' as EventId)).toBeUndefined();
  });

  it('should query by tick range', () => {
    const timeline = new Timeline();
    timeline.record(createEvent({ tick: 1 as TickNumber }));
    timeline.record(createEvent({ tick: 2 as TickNumber }));
    timeline.record(createEvent({ tick: 3 as TickNumber }));
    timeline.record(createEvent({ tick: 4 as TickNumber }));

    const results = timeline.query({
      fromTick: 2 as TickNumber,
      toTick: 3 as TickNumber,
    });
    expect(results).toHaveLength(2);
  });

  it('should query by event type', () => {
    const timeline = new Timeline();
    timeline.record(createEvent({ type: 'economy.gdp-updated' }));
    timeline.record(createEvent({ type: 'war.combat-resolved' }));
    timeline.record(createEvent({ type: 'economy.gdp-updated' }));

    const results = timeline.query({ eventType: 'economy.gdp-updated' });
    expect(results).toHaveLength(2);
  });

  it('should query by source system', () => {
    const timeline = new Timeline();
    timeline.record(createEvent({ sourceSystem: 'economy' }));
    timeline.record(createEvent({ sourceSystem: 'war' }));

    const results = timeline.query({ sourceSystem: 'economy' });
    expect(results).toHaveLength(1);
  });

  it('should query by entity ID', () => {
    const timeline = new Timeline();
    const entityId = 'country-br' as EntityId;
    timeline.record(createEvent({ entityId }));
    timeline.record(createEvent());

    const results = timeline.query({ entityId });
    expect(results).toHaveLength(1);
  });

  it('should support pagination (limit/offset)', () => {
    const timeline = new Timeline();
    for (let i = 0; i < 10; i++) {
      timeline.record(createEvent({ tick: 1 as TickNumber }));
    }

    const page1 = timeline.query({ limit: 3, offset: 0 });
    const page2 = timeline.query({ limit: 3, offset: 3 });

    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(3);
    expect(page1[0]!.sequenceId).toBe(0);
    expect(page2[0]!.sequenceId).toBe(3);
  });

  it('should return latest tick', () => {
    const timeline = new Timeline();
    expect(timeline.getLatestTick()).toBeUndefined();

    timeline.record(createEvent({ tick: 5 as TickNumber }));
    timeline.record(createEvent({ tick: 10 as TickNumber }));

    expect(timeline.getLatestTick()).toBe(10);
  });

  it('should create checkpoint', () => {
    const timeline = new Timeline();
    timeline.record(createEvent({ tick: 1 as TickNumber }));
    timeline.record(createEvent({ tick: 2 as TickNumber }));

    const checkpointId = timeline.createCheckpoint(2 as TickNumber);
    expect(checkpointId).toContain('checkpoint-2');
  });
});
