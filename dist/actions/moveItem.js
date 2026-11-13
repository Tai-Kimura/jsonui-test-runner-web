"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOVE_ITEM_LIST_MARGIN = exports.MOVE_ITEM_EDGE_MARGIN = exports.MOVE_ITEM_TIMING = void 0;
exports.planMoveItem = planMoveItem;
exports.moveItemFailure = moveItemFailure;
exports.scrolledDuring = scrolledDuring;
exports.scrolledSentence = scrolledSentence;
exports.MOVE_ITEM_TIMING = { pressSeconds: 1.0, holdSeconds: 0.5 };
/** a press or release nearer the viewport's top or bottom than this lets a list scroll by itself (the vectors' edgeMargin) */
exports.MOVE_ITEM_EDGE_MARGIN = 100;
/** ... and nearer its list's visible top or bottom than this (the libraries' band of 48 from the list's edges, + 8) */
exports.MOVE_ITEM_LIST_MARGIN = 56;
function planMoveItem(input) {
    const { viewport, from, to, rows, id } = input;
    if (from === to)
        return { fail: 'same' };
    if ((input.section ?? 0) !== 0)
        return { fail: 'section' };
    const [vx, vy, vw, vh] = viewport;
    // the list's visible part: list ∩ viewport (the whole viewport without a list)
    const [lx, ly, lw, lh] = input.list ?? viewport;
    const top = Math.max(vy, ly), bottom = Math.min(vy + vh, ly + lh);
    const left = Math.max(vx, lx), right = Math.min(vx + vw, lx + lw);
    const row = (n) => {
        const address = `${id}_item_${n}`;
        const found = rows[address] ?? [];
        if (found.length > 1)
            return `ambiguous:${address}`;
        if (found.length === 0)
            return `missing:${address}`;
        const [x, y, w, h] = found[0];
        if (x < vx || y < vy || x + w > vx + vw || y + h > vy + vh)
            return `offscreen:${address}`;
        if (input.list && (x < left || y < top || x + w > right || y + h > bottom))
            return `offscreen:${address}`;
        return found[0];
    };
    const fromRow = row(from);
    if (typeof fromRow === 'string')
        return { fail: fromRow };
    const toRow = row(to);
    if (typeof toRow === 'string')
        return { fail: toRow };
    let press;
    if (input.handle !== undefined) {
        if (input.handle === null)
            return { fail: 'no-handle' };
        const [hx, hy, hw, hh] = input.handle;
        press = [hx + hw / 2, hy + hh / 2];
    }
    else {
        press = [fromRow[0] + fromRow[2] / 2, fromRow[1] + fromRow[3] / 2];
    }
    const [, ty, , th] = toRow;
    const release = [press[0], ty + th * (to > from ? 0.75 : 0.25)];
    // the edge rule holds only on a side the scroller can still scroll towards (a list at its top keeps still)
    const up = input.canScrollUp ?? true, down = input.canScrollDown ?? true;
    const near = (y) => (up && (y - vy < exports.MOVE_ITEM_EDGE_MARGIN || (input.list !== undefined && y - top < exports.MOVE_ITEM_LIST_MARGIN)))
        || (down && (vy + vh - y < exports.MOVE_ITEM_EDGE_MARGIN || (input.list !== undefined && bottom - y < exports.MOVE_ITEM_LIST_MARGIN)));
    if (near(press[1]))
        return { fail: `edge:${id}_item_${from}` };
    if (near(release[1]))
        return { fail: `edge:${id}_item_${to}` };
    return { press, release };
}
/** The sentence a failed plan gives the step. */
function moveItemFailure(fail, from, handle) {
    const [kind, address] = fail.split(':');
    switch (kind) {
        case 'same': return `moveItem: 'from' and 'to' are the same row (${from}): nothing to move`;
        case 'section': return 'moveItem moves within section 0 (v1)';
        case 'ambiguous': return `moveItem: '${address}' is more than one element (a Collection of several sections: v1 moves within a single section)`;
        case 'missing': return `moveItem: '${address}' was not found`;
        case 'offscreen': return `moveItem: '${address}' is not on screen (scroll it into view first, e.g. scrollUntilVisible; the drag does not scroll)`;
        case 'edge': return `moveItem: '${address}' is too near the top or bottom of the screen (${exports.MOVE_ITEM_EDGE_MARGIN}) or of its list (${exports.MOVE_ITEM_LIST_MARGIN}): the list scrolls by itself there under a held finger; scroll it towards the middle first`;
        case 'no-handle': return `moveItem: the handle '${handle}' was not found inside the row (from ${from})`;
        default: return `moveItem: ${fail}`;
    }
}
/**
 * After the gesture: a row outside the moved range keeps its index and its place through a reorder, so if it moved
 * the list scrolled under the pointer and the row may have landed elsewhere (the vectors' verify).
 */
function scrolledDuring(before, after) {
    const moved = Math.max(...before.map((v, i) => Math.abs(v - after[i])));
    return moved > 1 ? moved : null;
}
function scrolledSentence(address, moved) {
    return `moveItem: the list scrolled during the drag ('${address}' moved by ${Math.round(moved)}); the row may have landed elsewhere — scroll the rows away from the list's edges first`;
}
//# sourceMappingURL=moveItem.js.map