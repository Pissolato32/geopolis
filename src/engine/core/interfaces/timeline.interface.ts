/**
 * @module core/interfaces/timeline
 * @description Contract for the Timeline — the append-only event ledger
 * that records every event in the simulation's history.
 *
 * Events are never deleted. A cancelled treaty is a new event, not the
 * removal of the original. This enables full auditability, deterministic
 * replay, and time-travel debugging.
 */

import { ISimulationEvent, TickNumber, EventId } from './event-bus.interface.js';

/**
 * A recorded event in the Timeline, enriched with sequence metadata.
 */
export interface ITimelineEntry {
  /** The original simulation event. */
  readonly event: ISimulationEvent;

  /** Monotonic sequence number within the tick (emission order). */
  readonly sequenceId: number;

  /** Integrity hash of the event payload for audit and replay verification. */
  readonly payloadHash: string;
}

/**
 * Filter criteria for querying the Timeline.
 */
export interface ITimelineQuery {
  /** Filter by tick range (inclusive). */
  readonly fromTick?: TickNumber;
  readonly toTick?: TickNumber;

  /** Filter by event type (exact match). */
  readonly eventType?: string;

  /** Filter by source system. */
  readonly sourceSystem?: string;

  /** Filter by related entity. */
  readonly entityId?: string;

  /** Maximum number of entries to return. */
  readonly limit?: number;

  /** Offset for pagination. */
  readonly offset?: number;
}

/**
 * The Timeline contract — immutable, append-only historical record.
 *
 * @remarks
 * - Entries are never modified or deleted after recording.
 * - Supports range queries for analysis and agent memory.
 * - Supports snapshot checkpoints for fast restore without full replay.
 */
export interface ITimeline {
  /**
   * Record an event in the Timeline. Called by the Event Bus during flush.
   * @param event - The simulation event to record.
   * @returns The timeline entry with assigned sequence metadata.
   */
  record(event: ISimulationEvent): ITimelineEntry;

  /**
   * Query the Timeline for events matching the given criteria.
   * @param query - Filter and pagination parameters.
   * @returns A readonly array of matching timeline entries, ordered by tick then sequence.
   */
  query(query: ITimelineQuery): ReadonlyArray<ITimelineEntry>;

  /**
   * Retrieve a single event by its unique identifier.
   * @param eventId - The event's unique ID.
   * @returns The timeline entry, or `undefined` if not found.
   */
  getById(eventId: EventId): ITimelineEntry | undefined;

  /**
   * Get the total number of recorded events.
   * @returns The event count.
   */
  getEventCount(): number;

  /**
   * Get the most recent tick number that has recorded events.
   * @returns The latest tick number, or `undefined` if the timeline is empty.
   */
  getLatestTick(): TickNumber | undefined;

  /**
   * Create a checkpoint marker at the current state.
   * Used in conjunction with World State snapshots for fast restore.
   * @param tick - The tick at which the checkpoint is created.
   * @returns A checkpoint identifier.
   */
  createCheckpoint(tick: TickNumber): string;
}
