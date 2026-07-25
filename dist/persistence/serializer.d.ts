import { ITickEngine } from '../core/interfaces/tick-engine.interface.js';
import { ISystem } from '../core/interfaces/system.interface.js';
import { ISaveGamePayload, IRehydrationResult } from './interfaces/save-game.interface.js';
export declare class SaveGameSerializer {
    static readonly VERSION = "1.0.0";
    /**
     * Create an immutable, verified save game payload from a tick-boundary simulation state.
     *
     * @param engine - Active simulation TickEngine.
     */
    static createSaveGame(engine: ITickEngine): ISaveGamePayload;
    /**
     * Rehydrate a complete simulation instance from a save game payload.
     * Validates global SHA-256 hash integrity and re-registers the system pipeline.
     *
     * @param payload - Target save game payload.
     * @param systems - Array of registered ISystem concrete instances.
     */
    static rehydrateEngine(payload: ISaveGamePayload, systems?: ReadonlyArray<ISystem>): IRehydrationResult;
}
//# sourceMappingURL=serializer.d.ts.map