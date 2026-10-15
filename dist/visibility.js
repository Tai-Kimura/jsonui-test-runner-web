"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DETACHED = exports.PROBE_TIMEOUT_MS = exports.MINIMUM_SIDE = void 0;
exports.shownPart = shownPart;
exports.inViewport = inViewport;
exports.geometry = geometry;
exports.isHidden = isHidden;
exports.probe = probe;
exports.viewportState = viewportState;
exports.isInViewport = isInViewport;
const playwright_1 = require("playwright");
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
exports.MINIMUM_SIDE = 1;
/** `rect` cut by every clip; null when nothing of it is left. */
function shownPart(rect, clips) {
    let part = { ...rect };
    for (const clip of clips) {
        part = {
            left: Math.max(part.left, clip.left),
            top: Math.max(part.top, clip.top),
            right: Math.min(part.right, clip.right),
            bottom: Math.min(part.bottom, clip.bottom),
        };
        if (part.right <= part.left || part.bottom <= part.top)
            return null;
    }
    return part;
}
function inViewport(rect, clips) {
    const part = shownPart(rect, clips);
    return part !== null && part.right - part.left >= exports.MINIMUM_SIDE && part.bottom - part.top >= exports.MINIMUM_SIDE;
}
/**
 * The element's box and the rectangles that clip it, read in the page: the
 * window's viewport, and each ancestor whose overflow is not `visible`, up to
 * the first `position: fixed` element (which is positioned against the
 * viewport, not against its ancestors).
 */
async function geometry(locator, timeout = exports.PROBE_TIMEOUT_MS) {
    const read = await probe((t) => locator.evaluate((el) => {
        const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        const clips = [{ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }];
        let fixed = getComputedStyle(el).position === 'fixed';
        for (let a = el.parentElement; a && !fixed; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')
                clips.push(box(a.getBoundingClientRect()));
            if (cs.position === 'fixed')
                fixed = true;
        }
        return { rect: box(el.getBoundingClientRect()), clips };
    }, undefined, { timeout: t }), timeout);
    return read === exports.DETACHED ? null : read;
}
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
async function isHidden(locator) {
    if ((await locator.count()) === 0)
        return true;
    return locator.evaluateAll((els) => els.every((el) => !el.checkVisibility({ visibilityProperty: true })));
}
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
exports.PROBE_TIMEOUT_MS = 1000;
/** What a bounded look answers when the element left the DOM. */
exports.DETACHED = Symbol('detached');
/** Run `op` with a timeout; a Playwright TimeoutError is the element having
 * left the DOM (DETACHED), anything else is rethrown. */
async function probe(op, timeout = exports.PROBE_TIMEOUT_MS) {
    try {
        return await op(timeout);
    }
    catch (e) {
        if (e instanceof playwright_1.errors.TimeoutError)
            return exports.DETACHED;
        throw e;
    }
}
async function viewportState(locator) {
    if ((await locator.count()) === 0)
        return 'absent';
    const first = locator.first();
    if (!(await first.isVisible()))
        return 'out';
    const g = await geometry(first);
    if (g === null)
        return 'absent';
    return inViewport(g.rect, g.clips) ? 'in' : 'out';
}
/** Whether the first element the locator matches is in the viewport. */
async function isInViewport(locator) {
    return (await viewportState(locator)) === 'in';
}
//# sourceMappingURL=visibility.js.map