import { ITimeline } from '../core/interfaces/timeline.interface.js';
import { TickNumber } from '../core/interfaces/event-bus.interface.js';
/**
 * Utility for exporting cold Timeline event segments into JSONL format.
 */
export declare class TimelineArchiver {
    /**
     * Export timeline events up to a specified tick number as a JSONL string.
     *
     * @param timeline - The Timeline instance.
     * @param toTick - Optional maximum tick limit to export.
     * @returns Formatted JSONL string (one JSON event object per line).
     */
    static archiveEventsToJsonl(timeline: Readonly<ITimeline>, toTick?: TickNumber): string;
}
//# sourceMappingURL=timeline-archiver.d.ts.map