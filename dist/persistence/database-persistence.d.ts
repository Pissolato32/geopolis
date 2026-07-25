import { ITickEngine } from '../core/interfaces/tick-engine.interface.js';
import { ISaveGamePayload } from './interfaces/save-game.interface.js';
export declare class DatabasePersistenceProvider {
    private readonly saveDir;
    private readonly latestSaveFile;
    constructor(customDir?: string);
    private ensureDirectory;
    /**
     * Save the current active simulation state with SHA-256 verification hash.
     */
    saveWorldState(engine: ITickEngine): Promise<string>;
    /**
     * Check if a valid save game exists.
     */
    hasSave(): boolean;
    /**
     * Load the latest save game payload.
     */
    loadLatestSave(): Promise<ISaveGamePayload | null>;
    /**
     * List all available save files.
     */
    listSaves(): string[];
}
//# sourceMappingURL=database-persistence.d.ts.map