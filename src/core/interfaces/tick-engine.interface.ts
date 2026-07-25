/**
 * @module core/interfaces/tick-engine
 * @description Contract for the Tick Engine — the simulation's heartbeat.
 *
 * The Tick Engine orchestrates the execution of all systems in priority order,
 * manages the tick lifecycle (input → execution → resolution → perception → agents),
 * and guarantees deterministic, reproducible simulation runs.
 */

import { ISystem } from './system.interface.js';
import { IWorldState } from './world-state.interface.js';
import { IEventBus, TickNumber } from './event-bus.interface.js';
import { ITimeline } from './timeline.interface.js';

/**
 * Configuration for the Tick Engine.
 */
export interface ITickEngineConfig {
  /** Maximum number of ticks to execute (0 = unlimited). */
  readonly maxTicks: number;

  /** Interval (in ticks) between automatic World State snapshots. 0 = disabled. */
  readonly snapshotInterval: number;

  /** Whether to enable deterministic replay mode (stricter ordering guarantees). */
  readonly deterministicMode: boolean;
}

/**
 * Metadata produced after each tick completes.
 */
export interface ITickResult {
  /** The tick number that was just processed. */
  readonly tick: TickNumber;

  /** Number of events emitted during this tick. */
  readonly eventsEmitted: number;

  /** Number of systems that executed during this tick. */
  readonly systemsExecuted: number;

  /** Wall-clock duration of the tick in milliseconds (for profiling). */
  readonly durationMs: number;

  /** Whether a snapshot was created during this tick. */
  readonly snapshotCreated: boolean;
}

/**
 * Lifecycle hooks for observing and extending tick execution.
 * Used for debugging, profiling, and test instrumentation.
 */
export interface ITickLifecycleHooks {
  /** Called before any system executes in the tick. */
  onTickStart?(tick: TickNumber): void;

  /** Called after all systems have executed and events have been resolved. */
  onTickEnd?(result: ITickResult): void;

  /** Called before a specific system executes. */
  onSystemStart?(systemId: string, tick: TickNumber): void;

  /** Called after a specific system finishes execution. */
  onSystemEnd?(systemId: string, tick: TickNumber): void;
}

/**
 * The Tick Engine contract — orchestrator of the simulation cycle.
 *
 * @remarks
 * - Systems are executed in strict priority order (lower priority value = earlier execution).
 * - The engine guarantees that given identical initial state and inputs, the
 *   tick produces byte-identical output (determinism guarantee).
 * - The engine coordinates World State, Event Bus, Timeline, and all registered Systems.
 */
export interface ITickEngine {
  // ─── Configuration ────────────────────────────────────────

  /**
   * Get the current engine configuration.
   */
  getConfig(): Readonly<ITickEngineConfig>;

  // ─── System Management ────────────────────────────────────

  /**
   * Register a system for execution in the tick pipeline.
   * @param system - The system to register.
   * @throws If a system with the same ID is already registered.
   */
  registerSystem(system: ISystem): void;

  /**
   * Unregister a system from the tick pipeline.
   * @param systemId - The ID of the system to remove.
   * @throws If no system with the given ID is registered.
   */
  unregisterSystem(systemId: string): void;

  /**
   * Get all registered systems, ordered by execution priority.
   * @returns A readonly array of system descriptors.
   */
  getRegisteredSystems(): ReadonlyArray<ISystem>;

  // ─── Tick Execution ───────────────────────────────────────

  /**
   * Execute a single simulation tick.
   *
   * Lifecycle:
   * 1. Input Collection — gather and validate queued actions.
   * 2. System Execution — execute all systems in priority order.
   * 3. Event Resolution — flush Event Bus, apply mutations to World State, record in Timeline.
   * 4. Perception Update — recalculate agent visibility (delegated to Perception System).
   * 5. Agent Evaluation — agents assess and queue actions (delegated to Agent System).
   * 6. Snapshot — if interval reached, persist World State.
   *
   * @returns Metadata about the completed tick.
   */
  tick(): ITickResult;

  /**
   * Execute multiple ticks in sequence.
   * @param count - Number of ticks to execute.
   * @returns An array of tick results, one per tick.
   */
  runTicks(count: number): ReadonlyArray<ITickResult>;

  /**
   * Get the current tick number.
   */
  getCurrentTick(): TickNumber;

  /**
   * Manually set the current tick number (used during save game rehydration).
   */
  setCurrentTick(tick: TickNumber): void;

  // ─── Lifecycle Hooks ──────────────────────────────────────

  /**
   * Register lifecycle hooks for observing tick execution.
   * @param hooks - The hook callbacks to register.
   */
  setLifecycleHooks(hooks: ITickLifecycleHooks): void;

  // ─── Dependencies ─────────────────────────────────────────

  /**
   * Get the World State instance managed by this engine.
   */
  getWorldState(): IWorldState;

  /**
   * Get the Event Bus instance managed by this engine.
   */
  getEventBus(): IEventBus;

  /**
   * Get the Timeline instance managed by this engine.
   */
  getTimeline(): ITimeline;
}
