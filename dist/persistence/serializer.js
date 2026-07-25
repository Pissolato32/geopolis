import { createHash } from 'node:crypto';
import { WorldState } from '../core/world-state/world-state.js';
import { Timeline } from '../core/timeline/timeline.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import { bigintJsonReplacer } from '../core/utils/bigint-json.js';
export class SaveGameSerializer {
    static VERSION = '1.0.0';
    /**
     * Create an immutable, verified save game payload from a tick-boundary simulation state.
     *
     * @param engine - Active simulation TickEngine.
     */
    static createSaveGame(engine) {
        const worldState = engine.getWorldState();
        const timeline = engine.getTimeline();
        const snapshot = worldState.createSnapshot();
        const metadata = worldState.getMetadata();
        const timelineEntries = timeline.query({});
        const serializedCore = JSON.stringify({
            version: this.VERSION,
            tick: metadata.currentTick,
            scenarioId: metadata.scenarioId,
            snapshotData: snapshot.data,
            timelineCount: timelineEntries.length,
        }, bigintJsonReplacer);
        const payloadHash = createHash('sha256').update(serializedCore).digest('hex');
        return {
            version: this.VERSION,
            createdAt: new Date().toISOString(),
            tick: metadata.currentTick,
            scenarioId: metadata.scenarioId,
            worldStateSnapshot: snapshot,
            timelineEntries,
            payloadHash,
        };
    }
    /**
     * Rehydrate a complete simulation instance from a save game payload.
     * Validates global SHA-256 hash integrity and re-registers the system pipeline.
     *
     * @param payload - Target save game payload.
     * @param systems - Array of registered ISystem concrete instances.
     */
    static rehydrateEngine(payload, systems = []) {
        // 1. Verify global SHA-256 payload integrity (Fail Fast)
        const expectedCore = JSON.stringify({
            version: payload.version,
            tick: payload.tick,
            scenarioId: payload.scenarioId,
            snapshotData: payload.worldStateSnapshot.data,
            timelineCount: payload.timelineEntries.length,
        }, bigintJsonReplacer);
        const computedHash = createHash('sha256').update(expectedCore).digest('hex');
        if (computedHash !== payload.payloadHash) {
            throw new Error('Save game integrity check failed: payload hash mismatch or file corrupted');
        }
        // 2. Instantiate and rehydrate WorldState
        const worldState = new WorldState(payload.scenarioId);
        worldState.restoreFromSnapshot(payload.worldStateSnapshot);
        // 3. Instantiate and rehydrate Timeline
        const timeline = new Timeline();
        for (const entry of payload.timelineEntries) {
            timeline.record(entry.event);
        }
        // 4. Instantiate EventBus and TickEngine
        const eventBus = new EventBus(timeline);
        eventBus.setCurrentTick(payload.tick);
        const tickEngine = new TickEngine(worldState, eventBus, timeline);
        tickEngine.setCurrentTick(payload.tick);
        // 5. Re-register systems (registerSystem already calls initialize)
        for (const sys of systems) {
            tickEngine.registerSystem(sys);
        }
        return {
            worldState,
            eventBus,
            timeline,
            tickEngine,
        };
    }
}
//# sourceMappingURL=serializer.js.map