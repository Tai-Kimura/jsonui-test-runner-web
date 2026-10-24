import type { Locator, Page } from 'playwright';
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
export declare function byId(page: Page, id: string, within?: string): Locator;
/** How a target reads in a message: `'x'`, or `'x' inside 'c'`. */
export declare function label(id: string, within?: string): string;
/** The container named by `within` is not in the page. */
export declare function containerMissing(within: string, suffix?: string): string;
/**
 * Why `id` was not found: without `within`, the message every step gave
 * before (`Element 'x' not found by id`); with it, which part is missing —
 * the container, or the target inside a container that is there.
 * `suffix` is appended to the "not found" phrase (e.g. " within 5000ms").
 */
export declare function notFound(page: Page, id: string, within?: string, suffix?: string): Promise<string>;
/** Whether the container named by `within` is in the page (true without one). */
export declare function containerPresent(page: Page, within?: string): Promise<boolean>;
//# sourceMappingURL=resolve.d.ts.map