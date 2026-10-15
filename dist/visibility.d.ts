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
export declare function geometry(locator: Locator, timeout?: number): Promise<{
    rect: Rect;
    clips: Rect[];
} | null>;
/**
 * `hidden` and `when: { hidden }`: not drawn, wherever it is. True when no
 * element matches, or none of those that do is drawn: `checkVisibility` with
 * `visibilityProperty` is false for `display: none` (JsonUI "gone"; the
 * element stays in the DOM, so `count` still finds it) and for `visibility:
 * hidden` (JsonUI "invisible" / `hidden: true`), on the element or an
 * ancestor. It does not look at the viewport, scroll containers, overlays,
 * opacity or size, so an element below the fold, under a dialog, at opacity
 * 0 or 0 x 0 is drawn and `hidden` fails on it. Measured 2026-10-15 (the
 * conformance web host, Chromium): the same answer as iOS (exists) and
 * Android's semantics tree on every shape.
 */
export declare function isHidden(locator: Locator): Promise<boolean>;
/**
 * How long one look waits for an element it has just counted.
 *
 * `locator.evaluate` (and boundingBox, textContent, ...) WAITS for the element
 * to be attached, with no timeout of its own (Playwright's actionTimeout is 0).
 * An element that left the DOM between `count()` and `evaluate` therefore held
 * the look until the test's own timeout (30 s): the assert's timeout never got
 * a turn, and the failure read "locator.evaluate: Test timeout of 30000ms
 * exceeded" (reported from a consumer: 1 run in 31, an element made gone by a
 * response arriving while `notVisible` looked at it). A look is now bounded: a
 * counted element that is not there within this long is read as gone, and the
 * poll around it carries on inside the assert's timeout.
 */
export declare const PROBE_TIMEOUT_MS = 1000;
/**
 * Whether `e` is Playwright's TimeoutError, by its name. Not `instanceof
 * errors.TimeoutError`: that compares against the class of the `playwright`
 * this driver resolves, and a page started from another playwright(-core)
 * copy throws an instance of ITS class — measured from a consumer that starts
 * the page with playwright-core 1.48.2 while the driver resolves playwright
 * 1.64.1: the check was false, the bounded look threw
 * "locator.evaluate: Timeout 1000ms exceeded." instead of reading DETACHED.
 * The name is the same in every copy.
 */
export declare function isTimeoutError(e: unknown): e is Error;
/** What a bounded look answers when the element left the DOM. */
export declare const DETACHED: unique symbol;
/** Run `op` with a timeout; a Playwright TimeoutError is the element having
 * left the DOM (DETACHED), anything else is rethrown. */
export declare function probe<T>(op: (timeout: number) => Promise<T>, timeout?: number): Promise<T | typeof DETACHED>;
/** Where the first element the locator matches is: not there (absent — also
 * when it leaves the DOM while being read), there but not in the viewport, or
 * in it. */
export type ViewportState = 'absent' | 'out' | 'in';
export declare function viewportState(locator: Locator): Promise<ViewportState>;
/** Whether the first element the locator matches is in the viewport. */
export declare function isInViewport(locator: Locator): Promise<boolean>;
//# sourceMappingURL=visibility.d.ts.map