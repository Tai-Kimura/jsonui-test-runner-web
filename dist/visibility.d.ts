import type { Locator } from 'playwright';
/**
 * `visible` / `notVisible`, `when: { visible }` and scrollUntilVisible's stop
 * condition: whether an element is in the viewport.
 *
 * In the viewport means: Playwright's isVisible() (a box, not display:none or
 * visibility:hidden), AND at least 1px each way of the element's box inside the
 * window's viewport and inside every ancestor that clips its content (overflow
 * not `visible`). Not "its centre": Android, the baseline (UiAutomator's
 * isVisibleToUser), calls a Label visible when only 5dp of it shows at the
 * bottom of a ScrollView, its centre outside (measured 2026-10-14).
 *
 * Until this, the driver asked isVisible() alone, which does not look at
 * scrolling: a Label at y 580 inside a 200px `overflow: auto` container was
 * `visible`, and scrollUntilVisible stopped before scrolling at all.
 */
/** The smallest side, in CSS px, that counts as shown (iOS: 1pt). */
export declare const MINIMUM_SIDE = 1;
export interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
/** `rect` cut by every clip; null when nothing of it is left. */
export declare function shownPart(rect: Rect, clips: Rect[]): Rect | null;
export declare function inViewport(rect: Rect, clips: Rect[]): boolean;
/**
 * The element's box and the rectangles that clip it, read in the page: the
 * window's viewport, and each ancestor whose overflow is not `visible`, up to
 * the first `position: fixed` element (which is positioned against the
 * viewport, not against its ancestors).
 */
export declare function geometry(locator: Locator): Promise<{
    rect: Rect;
    clips: Rect[];
}>;
/** Whether the first element the locator matches is in the viewport. */
export declare function isInViewport(locator: Locator): Promise<boolean>;
//# sourceMappingURL=visibility.d.ts.map