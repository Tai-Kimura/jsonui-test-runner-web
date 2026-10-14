/**
 * The reasons an auto-waiting assertion gave while it waited, in order.
 *
 * pollUntil used to keep only the last one. When the reason changed while
 * waiting — "not in the viewport" for two seconds, then "does not exist"
 * once the app's own polling removed the element — the failure named only
 * the second, and the reader went looking for an element that was never
 * rendered instead of one that was below the fold.
 *
 * The same block is written by the iOS and Android drivers; only the first
 * line of the message (the last reason, as before) is each face's own.
 */
export interface ReasonSegment {
    /** First line of the reason: the key consecutive observations fold on. */
    reason: string;
    /** Milliseconds since the poll started when this reason was first seen. */
    startMs: number;
}
/** Above this many segments the middle is elided. */
export declare const MAX_SEGMENTS = 8;
export declare class ReasonHistory {
    private readonly segments;
    /** Record one failed look. Folds into the current segment when the reason
     * is the same as the previous look's; A → B → A stays three segments. */
    observe(reason: string, atMs: number): void;
    get all(): readonly ReasonSegment[];
    /**
     * The message thrown at timeout: `last` unchanged, followed by the block
     * only when the reason changed while waiting. With one segment the
     * message is exactly `last` — byte for byte what pollUntil threw before.
     */
    message(last: string, endMs: number): string;
}
/** The block under the first line. Exported for the arms. */
export declare function renderBlock(segments: readonly ReasonSegment[], endMs: number): string;
//# sourceMappingURL=reasonHistory.d.ts.map