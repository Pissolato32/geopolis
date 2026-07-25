import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ITickEngine } from '../core/interfaces/tick-engine.interface.js';
import { SaveGameSerializer } from './serializer.js';
import { ISaveGamePayload } from './interfaces/save-game.interface.js';

export class DatabasePersistenceProvider {
  private readonly saveDir: string;
  private readonly latestSaveFile: string;

  constructor(customDir?: string) {
    this.saveDir = customDir ?? resolve(process.cwd(), 'data', 'savegames');
    this.latestSaveFile = join(this.saveDir, 'latest-world-state.json');
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.saveDir)) {
      mkdirSync(this.saveDir, { recursive: true });
    }
  }

  /**
   * Save the current active simulation state with SHA-256 verification hash.
   */
  public async saveWorldState(engine: ITickEngine): Promise<string> {
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
  public hasSave(): boolean {
    return existsSync(this.latestSaveFile);
  }

  /**
   * Load the latest save game payload.
   */
  public async loadLatestSave(): Promise<ISaveGamePayload | null> {
    if (!this.hasSave()) {
      return null;
    }

    try {
      const raw = readFileSync(this.latestSaveFile, 'utf-8');
      const payload = JSON.parse(raw) as ISaveGamePayload;
      console.log(`[Persistence] Hydrated save game from tick ${payload.tick}`);
      return payload;
    } catch (err) {
      console.error(`[Persistence] Failed to read save file: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * List all available save files.
   */
  public listSaves(): string[] {
    this.ensureDirectory();
    return readdirSync(this.saveDir).filter((f) => f.endsWith('.json'));
  }
}
