/**
 * Utility for exporting cold Timeline event segments into JSONL format.
 */
export class TimelineArchiver {
    /**
     * Export timeline events up to a specified tick number as a JSONL string.
     *
     * @param timeline - The Timeline instance.
     * @param toTick - Optional maximum tick limit to export.
     * @returns Formatted JSONL string (one JSON event object per line).
     */
    static archiveEventsToJsonl(timeline, toTick) {
        const entries = timeline.query(toTick !== undefined ? { toTick } : {});
        const lines = [];
        for (const entry of entries) {
            lines.push(JSON.stringify({
                sequenceId: entry.sequenceId,
                payloadHash: entry.payloadHash,
                event: entry.event,
            }));
        }
        return lines.join('\n');
    }
}
//# sourceMappingURL=timeline-archiver.js.map