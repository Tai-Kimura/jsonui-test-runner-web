/**
 * moveItem: where the finger presses and where it releases, or why the step
 * fails before anything moves (jsonui-test-runner schemas/actions.schema.json
 * moveItemAction, specs/vectors/move-item.json — test-fixtures/vectors).
 *
 * The press is the handle's centre when the step gives `handle`, else the from
 * row's centre; the release is in the press's column, over the to row at 3/4
 * of its height going down and 1/4 going up — never on a centre, which the
 * libraries' reorder rule (jsonui-cli shared/core/reorder_vectors.json) does
 * not count as passed and iOS 27's own reordering does.
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
export declare function planMoveItem(input: MoveItemInput): MoveItemPlan;
/** The sentence a failed plan gives the step. */
export declare function moveItemFailure(fail: string, from: number, handle?: string): string;
//# sourceMappingURL=moveItem.d.ts.map