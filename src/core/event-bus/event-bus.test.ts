import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus.js';
import { Timeline } from '../timeline/timeline.js';
import { TickNumber } from '../interfaces/event-bus.interface.js';
import { EntityId } from '../interfaces/entity.interface.js';

describe('EventBus', () => {
  function createBus() {
    const timeline = new Timeline();
    const bus = new EventBus(timeline);
    bus.setCurrentTick(1 as TickNumber);
    return { bus, timeline };
  }

  it('should publish events and deliver on flush', () => {
    const { bus } = createBus();
    const handler = vi.fn();

    bus.subscribe('test.event', handler);
    bus.publish('test.event', { value: 42 }, 'test-system');
    
    // Not delivered yet
    expect(handler).not.toHaveBeenCalled();

    bus.flush();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0].payload).toEqual({ value: 42 });
  });

  it('should only deliver to matching event type subscribers', () => {
    const { bus } = createBus();
    const econHandler = vi.fn();
    const warHandler = vi.fn();

    bus.subscribe('economy.update', econHandler);
    bus.subscribe('war.combat', warHandler);

    bus.publish('economy.update', { gdp: 1000 }, 'economy');
    bus.flush();

    expect(econHandler).toHaveBeenCalledOnce();
    expect(warHandler).not.toHaveBeenCalled();
  });

  it('should preserve emission order during flush', () => {
    const { bus } = createBus();
    const order: number[] = [];

    bus.subscribe<{ seq: number }>('test.ordered', (event) => {
      order.push(event.payload.seq);
    });

    bus.publish('test.ordered', { seq: 1 }, 'test');
    bus.publish('test.ordered', { seq: 2 }, 'test');
    bus.publish('test.ordered', { seq: 3 }, 'test');
    bus.flush();

    expect(order).toEqual([1, 2, 3]);
  });

  it('should assign correct tick and source metadata', () => {
    const { bus } = createBus();
    bus.setCurrentTick(5 as TickNumber);

    const handler = vi.fn();
    bus.subscribe('meta.test', handler);
    bus.publish('meta.test', {}, 'economy-system', 'entity-1' as EntityId);
    bus.flush();

    const event = handler.mock.calls[0]![0];
    expect(event.tick).toBe(5);
    expect(event.sourceSystem).toBe('economy-system');
    expect(event.entityId).toBe('entity-1');
    expect(event.type).toBe('meta.test');
  });

  it('should return unique EventId on publish', () => {
    const { bus } = createBus();
    const id1 = bus.publish('test', {}, 'sys');
    const id2 = bus.publish('test', {}, 'sys');

    expect(id1).not.toBe(id2);
  });

  it('should unsubscribe by token', () => {
    const { bus } = createBus();
    const handler = vi.fn();
    const token = bus.subscribe('test', handler);

    bus.publish('test', {}, 'sys');
    bus.flush();
    expect(handler).toHaveBeenCalledOnce();

    bus.unsubscribe(token);
    bus.publish('test', {}, 'sys');
    bus.flush();
    expect(handler).toHaveBeenCalledOnce(); // Still 1, not 2
  });

  it('should unsubscribe all by event type', () => {
    const { bus } = createBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.subscribe('test', h1);
    bus.subscribe('test', h2);
    bus.unsubscribeAll('test');

    bus.publish('test', {}, 'sys');
    bus.flush();

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('should forward all events to Timeline on flush', () => {
    const { bus, timeline } = createBus();

    bus.publish('a', { v: 1 }, 'sys');
    bus.publish('b', { v: 2 }, 'sys');
    bus.flush();

    expect(timeline.getEventCount()).toBe(2);
  });

  it('should process cascading events (published during flush)', () => {
    const { bus, timeline } = createBus();

    // Handler that emits a secondary event
    bus.subscribe('primary', () => {
      bus.publish('secondary', { cascade: true }, 'reactor');
    });

    const secondaryHandler = vi.fn();
    bus.subscribe('secondary', secondaryHandler);

    bus.publish('primary', {}, 'initiator');
    bus.flush();

    expect(secondaryHandler).toHaveBeenCalledOnce();
    expect(timeline.getEventCount()).toBe(2); // primary + secondary
  });

  it('should throw Fail Fast exception when maxEventsPerFlush cascade limit is exceeded', () => {
    const timeline = new Timeline();
    const bus = new EventBus(timeline, { maxEventsPerFlush: 10 });

    // Circular event cascade: ping -> pong -> ping -> pong
    bus.subscribe('ping', () => {
      bus.publish('pong', {}, 'loop-system');
    });
    bus.subscribe('pong', () => {
      bus.publish('ping', {}, 'loop-system');
    });

    bus.publish('ping', {}, 'initiator');

    expect(() => bus.flush()).toThrowError(/EventBus cascade loop limit exceeded!/);
  });
});
