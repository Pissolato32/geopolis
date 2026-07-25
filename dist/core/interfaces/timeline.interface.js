/**
 * @module core/interfaces/timeline
 * @description Contract for the Timeline — the append-only event ledger
 * that records every event in the simulation's history.
 *
 * Events are never deleted. A cancelled treaty is a new event, not the
 * removal of the original. This enables full auditability, deterministic
 * replay, and time-travel debugging.
 */
export {};
//# sourceMappingURL=timeline.interface.js.map