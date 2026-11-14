/**
 * moveItem: where the finger presses and where it releases, or why the step
 * fails before anything moves (jsonui-test-runner schemas/actions.schema.json
 * moveItemAction, specs/vectors/move-item.json — test-fixtures/vectors).
 *
 * The press is the handle's centre when the step gives `handle`, else the from
 * row's centre; the release is in the press's column, where the dragged row's
 * centre lands over the to row at 3/4 of its height going down and 1/4 going
 * up, plus the press's offset from the from row's centre (the rule reads the
 * row's centre, not the finger: a row held by a handle off its centre is let go
 * that much off). Never on an edge: the libraries' reorder rule (jsonui-cli
 * shared/core/reorder_vectors.json) passes a row when the dragged centre goes
 * beyond its edge, as iOS 27's own reordering does.
 */
export type Rect = [number, number, number, number];
export interface MoveItemInput {
    viewport: Rect;
    from: number;
    to: number;
    section?: number;
    /** address -> the rects found for it (none: not drawn; two or more: the address repeats) */
    rows: Record<string, Rect[]>;
    /** absent: the step gives no handle; null: it gives one and none was found in the from row */
    handle?: Rect | null;
    /** the Collection id the addresses are built from */
    id: string;
    /** the scrolling list that holds the rows (the nearest scrollable ancestor); absent when the page scrolls */
    list?: Rect;
    /** whether the rows' scroller can still scroll up / down (absent: true — refuse near that edge when unsure) */
    canScrollUp?: boolean;
    canScrollDown?: boolean;
}
export type MoveItemPlan = {
    press: [number, number];
    release: [number, number];
} | {
    fail: string;
};
export declare const MOVE_ITEM_TIMING: {
    readonly pressSeconds: 1;
    readonly holdSeconds: 0.5;
};
/** a press or release nearer the viewport's top or bottom than this lets a list scroll by itself (the vectors' edgeMargin) */
export declare const MOVE_ITEM_EDGE_MARGIN = 100;
/** ... and nearer its list's visible top or bottom than this (the libraries' band of 48 from the list's edges, + 8) */
export declare const MOVE_ITEM_LIST_MARGIN = 56;
export declare function planMoveItem(input: MoveItemInput): MoveItemPlan;
/** The sentence a failed plan gives the step. */
export declare function moveItemFailure(fail: string, from: number, handle?: string): string;
/**
 * After the gesture: a row outside the moved range keeps its index and its place through a reorder, so if it moved
 * the list scrolled under the pointer and the row may have landed elsewhere (the vectors' verify). Only the top (y) is
 * compared: v1 reorders one vertical column, and a row's x or size can change while it settles without it moving.
 */
export declare function scrolledDuring(before: Rect, after: Rect | null): number | null;
export declare function scrolledSentence(address: string, moved: number): string;
//# sourceMappingURL=moveItem.d.ts.map