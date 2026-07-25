import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SaveGameSerializer } from './serializer.js';
export class DatabasePersistenceProvider {
    saveDir;
    latestSaveFile;
    constructor(customDir) {
        this.saveDir = customDir ?? resolve(process.cwd(), 'data', 'savegames');
        this.latestSaveFile = join(this.saveDir, 'latest-world-state.json');
        this.ensureDirectory();
    }
    ensureDirectory() {
        if (!existsSync(this.saveDir)) {
            mkdirSync(this.saveDir, { recursive: true });
        }
    }
    /**
     * Save the current active simulation state with SHA-256 verification hash.
     */
    async saveWorldState(engine) {
        this.ensureDirectory();
        const savePayload = SaveGameSerializer.createSaveGame(engine);
        const serialized = JSON.stringify(savePayload, null, 2);
        writeFileSync(this.latestSaveFile, serialized, 'utf-8');
        // Also write a timestamped snapshot
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const timestampFile = join(this.saveDir, `save-${timestamp}.json`);
        writeFileSync(timestampFile, serialized, 'utf-8');
        console.log(`[Persistence] World state saved at tick ${savePayload.tick} (Hash: ${savePayload.payloadHash.slice(0, 8)}...)`);
        return savePayload.payloadHash;
    }
    /**
     * Check if a valid save game exists.
     */
    hasSave() {
        return existsSync(this.latestSaveFile);
    }
    /**
     * Load the latest save game payload.
     */
    async loadLatestSave() {
        if (!this.hasSave()) {
            return null;
        }
        try {
            const raw = readFileSync(this.latestSaveFile, 'utf-8');
            const payload = JSON.parse(raw);
            console.log(`[Persistence] Hydrated save game from tick ${payload.tick}`);
            return payload;
        }
        catch (err) {
            console.error(`[Persistence] Failed to read save file: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }
    /**
     * List all available save files.
     */
    listSaves() {
        this.ensureDirectory();
        return readdirSync(this.saveDir).filter((f) => f.endsWith('.json'));
    }
}
//# sourceMappingURL=database-persistence.js.map