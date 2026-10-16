/**
 * JsonUI Test Runner - Web Driver
 * Launch configuration, applied by the runner (spec §5, §10.2 steps 1-3).
 *
 * There is no helper for the harness to call: the runner applies `launch`
 * on the page it is driving, then writes the initialState payload, switches
 * the mocks and reloads once (`goto` on a reopen).
 */
import { Page } from 'playwright';
import { LaunchConfig } from '../models/types';
/** sessionStorage key the arguments travel in. */
export declare const ARGS_KEY = "JSONUI_TEST_ARGS";
/** True for a page with no origin to hold storage (nothing navigated yet). */
export declare function isBlank(url: string): boolean;
/**
 * Steps 1-3 of the launch sequence on the page under test:
 *
 * 1. clearState — cookies, and the origin's local and session storage
 *    (IndexedDB is not touched).
 * 2. permissions — when any value is `deny` or `unset`, clear every
 *    permission first, then grant the `allow`s again. (Clearing only for
 *    `unset` left an earlier file's `allow` in place.)
 * 3. arguments — `sessionStorage["JSONUI_TEST_ARGS"]` (JSON); removed when
 *    this launch has none.
 *
 * The page must already be on the app's origin: storage belongs to an origin
 * and the reload that follows reopens the same URL.
 */
export declare function applyLaunchToPage(page: Page, launch: LaunchConfig | undefined): Promise<void>;
/**
 * End of a file: remove what the runner put in sessionStorage so the next file
 * starts without it. A page with no origin has nothing to remove.
 */
export declare function clearTestStorage(page: Page): Promise<void>;
//# sourceMappingURL=LaunchConfig.d.ts.map