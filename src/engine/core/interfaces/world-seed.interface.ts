/**
 * @module core/interfaces/world-seed
 * @description Contract for world seed data initialization (world-seed-2026.json).
 *
 * Implements ADR-001 static geopolitical seeding requirements: defines start date
 * (July 24, 2026), ~208 initial sovereign entities, and relational tension graph.
 */

import { EntityId } from './entity.interface.js';
import { IComponent } from './component.interface.js';

/** Initial seed entry for a relational edge between two entities. */
export interface IRelationSeed {
  readonly sourceEntityId: EntityId;
  readonly targetEntityId: EntityId;
  /** Affinity score between -1.0 (war/hostile) and +1.0 (allied/trust). */
  readonly affinity: number;
  /** Tension level from 0.0 (peace) to 1.0 (imminent conflict). */
  readonly tension: number;
  /** Diplomatic recognition status (e.g., "full", "partial", "unrecognized"). */
  readonly recognition: string;
}

/** Initial seed data for an entity in the scenario. */
export interface IEntitySeed {
  readonly id: EntityId;
  readonly name: string;
  readonly entityType: string;
  readonly components: ReadonlyArray<IComponent>;
  readonly position?: { lat: number; lng: number };
}

/** Complete scenario seed configuration shape (e.g. world-seed-2026.json). */
export interface IWorldSeed {
  readonly scenarioId: string;
  /** ISO 8601 start date (e.g., "2026-07-24"). */
  readonly startDate: string;
  readonly description: string;
  readonly initialEntities: ReadonlyArray<IEntitySeed>;
  readonly initialRelations: ReadonlyArray<IRelationSeed>;
}
