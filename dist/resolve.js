"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.byId = byId;
exports.label = label;
exports.containerMissing = containerMissing;
exports.notFound = notFound;
exports.containerPresent = containerPresent;
/**
 * The one place an element id becomes a locator, for every step that targets
 * an element by id (actions, assertions, `when` / `while` conditions).
 *
 * `within` scopes the lookup to the DESCENDANTS of another element, found by
 * its id the same way: normally a collection cell `<collectionId>_item_<n>`
 * (the id tapItem resolves), whose children keep their own ids, so that the
 * same id repeated in every cell can be told apart. Without `within` an id
 * matches anywhere in the page, as it always has (a CSS descendant form such
 * as "A #B" in an id keeps working: the id is put after `#` unchanged).
 *
 * The container is the FIRST element with its id; the target is every
 * element with its id inside that one.
 */
function byId(page, id, within) {
    if (!within)
        return page.locator(`#${id}`);
    return page.locator(`#${within}`).first().locator(`#${id}`);
}
/** How a target reads in a message: `'x'`, or `'x' inside 'c'`. */
function label(id, within) {
    return within ? `'${id}' inside '${within}'` : `'${id}'`;
}
/** The container named by `within` is not in the page. */
function containerMissing(within, suffix = '') {
    return (`Container '${within}' (within) not found by id${suffix} — a collection cell is in the ` +
        'tree only while it is drawn: scrollUntilVisible to it first');
}
/**
 * Why `id` was not found: without `within`, the message every step gave
 * before (`Element 'x' not found by id`); with it, which part is missing —
 * the container, or the target inside a container that is there.
 * `suffix` is appended to the "not found" phrase (e.g. " within 5000ms").
 */
async function notFound(page, id, within, suffix = '') {
    if (!within)
        return `Element '${id}' not found by id${suffix}`;
    if ((await page.locator(`#${within}`).count()) === 0)
        return containerMissing(within, suffix);
    return `Element '${id}' not found inside '${within}'${suffix} (the container is there; no descendant has that id)`;
}
/** Whether the container named by `within` is in the page (true without one). */
async function containerPresent(page, within) {
    if (!within)
        return true;
    return (await page.locator(`#${within}`).count()) > 0;
}
//# sourceMappingURL=resolve.js.map