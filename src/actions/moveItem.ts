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
  /** the scrolling list that holds the rows (the nearest scrollable ancestor); absent when the page scrolls */
  list?: Rect;
  /** whether the rows' scroller can still scroll up / down (absent: true — refuse near that edge when unsure) */
  canScrollUp?: boolean;
  canScrollDown?: boolean;
}

export type MoveItemPlan = { press: [number, number]; release: [number, number] } | { fail: string };

export const MOVE_ITEM_TIMING = { pressSeconds: 1.0, holdSeconds: 0.5 } as const;
/** a press or release nearer the viewport's top or bottom than this lets a list scroll by itself (the vectors' edgeMargin) */
export const MOVE_ITEM_EDGE_MARGIN = 100;
/** ... and nearer its list's visible top or bottom than this (the libraries' band of 48 from the list's edges, + 8) */
export const MOVE_ITEM_LIST_MARGIN = 56;

export function planMoveItem(input: MoveItemInput): MoveItemPlan {
  const { viewport, from, to, rows, id } = input;
  if (from === to) return { fail: 'same' };
  if ((input.section ?? 0) !== 0) return { fail: 'section' };
  const [vx, vy, vw, vh] = viewport;
  // the list's visible part: list ∩ viewport (the whole viewport without a list)
  const [lx, ly, lw, lh] = input.list ?? viewport;
  const top = Math.max(vy, ly), bottom = Math.min(vy + vh, ly + lh);
  const left = Math.max(vx, lx), right = Math.min(vx + vw, lx + lw);
  const row = (n: number): Rect | string => {
    const address = `${id}_item_${n}`;
    const found = rows[address] ?? [];
    if (found.length > 1) return `ambiguous:${address}`;
    if (found.length === 0) return `missing:${address}`;
    const [x, y, w, h] = found[0];
    if (x < vx || y < vy || x + w > vx + vw || y + h > vy + vh) return `offscreen:${address}`;
    if (input.list && (x < left || y < top || x + w > right || y + h > bottom)) return `offscreen:${address}`;
    return found[0];
  };
  const fromRow = row(from);
  if (typeof fromRow === 'string') return { fail: fromRow };
  const toRow = row(to);
  if (typeof toRow === 'string') return { fail: toRow };
  let press: [number, number];
  if (input.handle !== undefined) {
    if (input.handle === null) return { fail: 'no-handle' };
    const [hx, hy, hw, hh] = input.handle;
    press = [hx + hw / 2, hy + hh / 2];
  } else {
    press = [fromRow[0] + fromRow[2] / 2, fromRow[1] + fromRow[3] / 2];
  }
  const [, ty, , th] = toRow;
  const release: [number, number] = [press[0], ty + th * (to > from ? 0.75 : 0.25)];
  // the edge rule holds only on a side the scroller can still scroll towards (a list at its top keeps still)
  const up = input.canScrollUp ?? true, down = input.canScrollDown ?? true;
  const near = (y: number) =>
    (up && (y - vy < MOVE_ITEM_EDGE_MARGIN || (input.list !== undefined && y - top < MOVE_ITEM_LIST_MARGIN)))
    || (down && (vy + vh - y < MOVE_ITEM_EDGE_MARGIN || (input.list !== undefined && bottom - y < MOVE_ITEM_LIST_MARGIN)));
  if (near(press[1])) return { fail: `edge:${id}_item_${from}` };
  if (near(release[1])) return { fail: `edge:${id}_item_${to}` };
  return { press, release };
}

/** The sentence a failed plan gives the step. */
export function moveItemFailure(fail: string, from: number, handle?: string): string {
  const [kind, address] = fail.split(':');
  switch (kind) {
    case 'same': return `moveItem: 'from' and 'to' are the same row (${from}): nothing to move`;
    case 'section': return 'moveItem moves within section 0 (v1)';
    case 'ambiguous': return `moveItem: '${address}' is more than one element (a Collection of several sections: v1 moves within a single section)`;
    case 'missing': return `moveItem: '${address}' was not found`;
    case 'offscreen': return `moveItem: '${address}' is not on screen (scroll it into view first, e.g. scrollUntilVisible; the drag does not scroll)`;
    case 'edge': return `moveItem: '${address}' is too near the top or bottom of the screen (${MOVE_ITEM_EDGE_MARGIN}) or of its list (${MOVE_ITEM_LIST_MARGIN}): the list scrolls by itself there under a held finger; scroll it towards the middle first`;
    case 'no-handle': return `moveItem: the handle '${handle}' was not found inside the row (from ${from})`;
    default: return `moveItem: ${fail}`;
  }
}

/**
 * After the gesture: a row outside the moved range keeps its index and its place through a reorder, so if it moved
 * the list scrolled under the pointer and the row may have landed elsewhere (the vectors' verify).
 */
export function scrolledDuring(before: Rect, after: Rect | null): number | null {
  if (after === null) return Infinity;   // no longer found: a lazy list scrolled it away
  const moved = Math.max(...before.map((v, i) => Math.abs(v - after[i])));
  return moved > 1 ? moved : null;
}

export function scrolledSentence(address: string, moved: number): string {
  const how = Number.isFinite(moved) ? `moved by ${Math.round(moved)}` : 'moved off the screen';
  return `moveItem: the list scrolled during the drag ('${address}' ${how}); the row may have landed elsewhere — scroll the rows away from the list's edges first`;
}
