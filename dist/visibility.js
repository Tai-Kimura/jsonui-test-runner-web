"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MINIMUM_SIDE = void 0;
exports.shownPart = shownPart;
exports.inViewport = inViewport;
exports.geometry = geometry;
exports.isInViewport = isInViewport;
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
async function geometry(locator) {
    return locator.evaluate((el) => {
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
    });
}
/** Whether the first element the locator matches is in the viewport. */
async function isInViewport(locator) {
    if ((await locator.count()) === 0)
        return false;
    const first = locator.first();
    if (!(await first.isVisible()))
        return false;
    const { rect, clips } = await geometry(first);
    return inViewport(rect, clips);
}
//# sourceMappingURL=visibility.js.map