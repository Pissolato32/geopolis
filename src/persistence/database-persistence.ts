import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ITickEngine } from '../core/interfaces/tick-engine.interface.js';
import { SaveGameSerializer } from './serializer.js';
import { ISaveGamePayload } from './interfaces/save-game.interface.js';
import { ILogger, defaultLogger } from './logger.js';

export class DatabasePersistenceProvider {
  private readonly saveDir: string;
  private readonly latestSaveFile: string;
  private readonly logger: ILogger;

  constructor(
    customDir?: string,
    logger: ILogger = defaultLogger,
  ) {
    this.saveDir = customDir ?? resolve(process.cwd(), 'data', 'savegames');
    this.latestSaveFile = join(this.saveDir, 'latest-world-state.json');
    this.logger = logger;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.saveDir)) {
      mkdirSync(this.saveDir, { recursive: true });
    }
  }

  public async saveWorldState(engine: ITickEngine): Promise<string> {
    this.ensureDirectory();
    const savePayload = SaveGameSerializer.createSaveGame(engine);
    const serialized = JSON.stringify(savePayload, null, 2);

    writeFileSync(this.latestSaveFile, serialized, 'utf-8');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const timestampFile = join(this.saveDir, `save-${timestamp}.json`);
    writeFileSync(timestampFile, serialized, 'utf-8');

    this.logger.info(`[Persistence] World state saved at tick ${savePayload.tick} (Hash: ${savePayload.payloadHash.slice(0, 8)}...)`);
    return savePayload.payloadHash;
  }

  public hasSave(): boolean {
    return existsSync(this.latestSaveFile);
  }

  public async loadLatestSave(): Promise<ISaveGamePayload | null> {
    if (!this.hasSave()) {
      return null;
    }

    try {
      const raw = readFileSync(this.latestSaveFile, 'utf-8');
      const payload = JSON.parse(raw) as ISaveGamePayload;
      this.logger.info(`[Persistence] Hydrated save game from tick ${payload.tick}`);
      return payload;
    } catch (err) {
      this.logger.error(`[Persistence] Failed to read save file: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  public listSaves(): string[] {
    this.ensureDirectory();
    return readdirSync(this.saveDir).filter((f) => f.endsWith('.json'));
  }
}
