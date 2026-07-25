import { WorldState } from '../world-state/world-state.js';
/**
 * Concrete Tick Engine implementation — orchestrator of the simulation cycle.
 *
 * Executes registered systems in priority order, flushes the Event Bus,
 * and manages snapshots. Phases 4-5 (Perception + Agent) are extension
 * points for Phase 3 implementation.
 */
export class TickEngine {
    config;
    worldState;
    eventBus;
    timeline;
    systems = [];
    currentTick = 0;
    hooks = {};
    constructor(worldState, eventBus, timeline, config = {}) {
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
    getConfig() {
        return this.config;
    }
    // ─── System Management ────────────────────────────────────
    registerSystem(system) {
        const existing = this.systems.find((s) => s.descriptor.id === system.descriptor.id);
        if (existing) {
            throw new Error(`System "${system.descriptor.id}" is already registered`);
        }
        this.systems.push(system);
        // Re-sort by priority after each registration (stable sort)
        this.systems.sort((a, b) => a.descriptor.priority - b.descriptor.priority);
        // Call initialization hook if provided
        if (system.initialize) {
            system.initialize(this.eventBus, this.worldState);
        }
    }
    unregisterSystem(systemId) {
        const index = this.systems.findIndex((s) => s.descriptor.id === systemId);
        if (index === -1) {
            throw new Error(`System "${systemId}" is not registered`);
        }
        const system = this.systems[index];
        if (system.teardown) {
            system.teardown();
        }
        this.systems.splice(index, 1);
    }
    getRegisteredSystems() {
        return this.systems;
    }
    // ─── Tick Execution ───────────────────────────────────────
    tick() {
        const startTime = performance.now();
        // Advance tick
        this.currentTick = (this.currentTick + 1);
        this.eventBus.setCurrentTick(this.currentTick);
        // Update world state tick if it supports it
        if (this.worldState instanceof WorldState) {
            this.worldState.setCurrentTick(this.currentTick);
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
        if (this.config.snapshotInterval > 0 &&
            this.currentTick % this.config.snapshotInterval === 0) {
            this.worldState.createSnapshot();
            snapshotCreated = true;
        }
        const durationMs = performance.now() - startTime;
        const result = {
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
    runTicks(count) {
        const results = [];
        for (let i = 0; i < count; i++) {
            if (this.config.maxTicks > 0 &&
                this.currentTick >= this.config.maxTicks) {
                break;
            }
            results.push(this.tick());
        }
        return results;
    }
    getCurrentTick() {
        return this.currentTick;
    }
    setCurrentTick(tick) {
        this.currentTick = tick;
        this.worldState.setCurrentTick(tick);
        this.eventBus.setCurrentTick(tick);
    }
    // ─── Lifecycle Hooks ──────────────────────────────────────
    setLifecycleHooks(hooks) {
        this.hooks = hooks;
    }
    // ─── Dependencies ─────────────────────────────────────────
    getWorldState() {
        return this.worldState;
    }
    getEventBus() {
        return this.eventBus;
    }
    getTimeline() {
        return this.timeline;
    }
}
//# sourceMappingURL=tick-engine.js.map