import {
  ITickEngine,
  ITickEngineConfig,
  ITickResult,
  ITickLifecycleHooks,
} from '../interfaces/tick-engine.interface.js';
import { ISystem } from '../interfaces/system.interface.js';
import { IWorldState } from '../interfaces/world-state.interface.js';
import { IEventBus, TickNumber } from '../interfaces/event-bus.interface.js';
import { ITimeline } from '../interfaces/timeline.interface.js';
import { WorldState } from '../world-state/world-state.js';

/**
 * Concrete Tick Engine implementation — orchestrator of the simulation cycle.
 *
 * Executes registered systems in priority order, flushes the Event Bus,
 * and manages snapshots. Phases 4-5 (Perception + Agent) are extension
 * points for Phase 3 implementation.
 */
export class TickEngine implements ITickEngine {
  private readonly config: ITickEngineConfig;
  private readonly worldState: IWorldState;
  private readonly eventBus: IEventBus;
  private readonly timeline: ITimeline;
  private systems: ISystem[] = [];
  private currentTick: TickNumber = 0 as TickNumber;
  private hooks: ITickLifecycleHooks = {};

  constructor(
    worldState: IWorldState,
    eventBus: IEventBus,
    timeline: ITimeline,
    config: Partial<ITickEngineConfig> = {},
  ) {
    this.worldState = worldState;
    this.eventBus = eventBus;
    this.timeline = timeline;
    this.config = {
      maxTicks: config.maxTicks ?? 0,
      snapshotInterval: config.snapshotInterval ?? 0,
      deterministicMode: config.deterministicMode ?? true,
    };
  }

  // ─── Configuration ────────────────────────────────────────

  getConfig(): Readonly<ITickEngineConfig> {
    return this.config;
  }

  // ─── System Management ────────────────────────────────────

  registerSystem(system: ISystem): void {
    const existing = this.systems.find(
      (s) => s.descriptor.id === system.descriptor.id,
    );
    if (existing) {
      throw new Error(
        `System "${system.descriptor.id}" is already registered`,
      );
    }

    this.systems.push(system);
    // Re-sort by priority after each registration (stable sort)
    this.systems.sort(
      (a, b) => (a.descriptor.priority as number) - (b.descriptor.priority as number),
    );

    // Call initialization hook if provided
    if (system.initialize) {
      system.initialize(this.eventBus, this.worldState);
    }
  }

  unregisterSystem(systemId: string): void {
    const index = this.systems.findIndex((s) => s.descriptor.id === systemId);
    if (index === -1) {
      throw new Error(`System "${systemId}" is not registered`);
    }

    const system = this.systems[index]!;
    if (system.teardown) {
      system.teardown();
    }

    this.systems.splice(index, 1);
  }

  getRegisteredSystems(): ReadonlyArray<ISystem> {
    return this.systems;
  }

  // ─── Tick Execution ───────────────────────────────────────

  tick(): ITickResult {
    const startTime = performance.now();

    // Advance tick
    this.currentTick = (this.currentTick + 1) as TickNumber;
    this.eventBus.setCurrentTick(this.currentTick);

    // Update world state tick if it supports it
    if (this.worldState instanceof WorldState) {
      (this.worldState as WorldState).setCurrentTick(this.currentTick);
    }

    // Lifecycle: onTickStart
    if (this.hooks.onTickStart) {
      this.hooks.onTickStart(this.currentTick);
    }

    // Phase 2: System Execution (priority order)
    let systemsExecuted = 0;
    for (const system of this.systems) {
      if (this.hooks.onSystemStart) {
        this.hooks.onSystemStart(system.descriptor.id, this.currentTick);
      }

      system.execute(this.worldState, this.eventBus);
      systemsExecuted++;

      if (this.hooks.onSystemEnd) {
        this.hooks.onSystemEnd(system.descriptor.id, this.currentTick);
      }
    }

    // Phase 3: Event Resolution
    const eventsBeforeFlush = this.timeline.getEventCount();
    this.eventBus.flush();
    const eventsEmitted = this.timeline.getEventCount() - eventsBeforeFlush;

    // Phase 6: Snapshot (conditional)
    let snapshotCreated = false;
    if (
      this.config.snapshotInterval > 0 &&
      (this.currentTick as number) % this.config.snapshotInterval === 0
    ) {
      this.worldState.createSnapshot();
      snapshotCreated = true;
    }

    const durationMs = performance.now() - startTime;

    const result: ITickResult = {
      tick: this.currentTick,
      eventsEmitted,
      systemsExecuted,
      durationMs,
      snapshotCreated,
    };

    // Lifecycle: onTickEnd
    if (this.hooks.onTickEnd) {
      this.hooks.onTickEnd(result);
    }

    return result;
  }

  runTicks(count: number): ReadonlyArray<ITickResult> {
    const results: ITickResult[] = [];
    for (let i = 0; i < count; i++) {
      if (
        this.config.maxTicks > 0 &&
        (this.currentTick as number) >= this.config.maxTicks
      ) {
        break;
      }
      results.push(this.tick());
    }
    return results;
  }

  getCurrentTick(): TickNumber {
    return this.currentTick;
  }

  setCurrentTick(tick: TickNumber): void {
    this.currentTick = tick;
    (this.worldState as WorldState).setCurrentTick(tick);
    this.eventBus.setCurrentTick(tick);
  }

  // ─── Lifecycle Hooks ──────────────────────────────────────

  setLifecycleHooks(hooks: ITickLifecycleHooks): void {
    this.hooks = hooks;
  }

  // ─── Dependencies ─────────────────────────────────────────

  getWorldState(): IWorldState {
    return this.worldState;
  }

  getEventBus(): IEventBus {
    return this.eventBus;
  }

  getTimeline(): ITimeline {
    return this.timeline;
  }
}
