/**
 * @module persistence
 * @description Barrel export for GeoPolis persistence and serialization utilities.
 */

export type { ISaveGamePayload, IRehydrationResult } from './interfaces/save-game.interface.js';
export { SaveGameSerializer } from './serializer.js';
export { TimelineArchiver } from './timeline-archiver.js';
export { DatabasePersistenceProvider } from './database-persistence.js';
export type { ILogger } from './logger.js';
export { defaultLogger } from './logger.js';
