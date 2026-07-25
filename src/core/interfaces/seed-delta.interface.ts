import { EntityId } from './entity.interface.js';
import { IComponent } from './component.interface.js';
import { IRelationSeed } from './world-seed.interface.js';

/** An entity override entry in a BYOD Delta Patch. */
export interface IPatchEntity {
  /** Raw or canonical entity ID. */
  readonly id: string;
  readonly name?: string;
  /** Component overrides to apply over base seed components. */
  readonly components: ReadonlyArray<IComponent>;
}

/** The shape of a compact Delta Patch payload returned by an external LLM. */
export interface IDeltaSeedPayload {
  readonly scenarioId?: string;
  /** Effective campaign start date (ISO 8601 string, e.g. "2026-07-24"). */
  readonly campaignStartDate?: string;
  /** Summary description of the geopolitical patch context. */
  readonly patchDescription?: string;
  /** List of modified or active entities. */
  readonly entityPatches: ReadonlyArray<IPatchEntity>;
  /** Optional relation edge updates. */
  readonly relationPatches?: ReadonlyArray<IRelationSeed>;
}

/** Detailed report produced by SeedSanitizer during payload import. */
export interface ISanitizationReport {
  readonly totalPatchesProcessed: number;
  readonly aliasesResolved: ReadonlyArray<{ rawId: string; canonicalId: EntityId }>;
  readonly valuesClamped: ReadonlyArray<{ entityId: string; field: string; original: number; clamped: number }>;
  readonly fieldsDropped: ReadonlyArray<{ entityId: string; field: string; reason: string }>;
  readonly isClean: boolean;
}
