"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * Launch configuration, applied by the runner (spec §5, §10.2 steps 1-3).
 *
 * There is no helper for the harness to call: the runner applies `launch`
 * on the page it is driving, then writes the initialState payload, switches
 * the mocks and reloads once (`goto` on a reopen).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARGS_KEY = void 0;
exports.isBlank = isBlank;
exports.applyLaunchToPage = applyLaunchToPage;
exports.clearTestStorage = clearTestStorage;
const InitialState_1 = require("./InitialState");
/** sessionStorage key the arguments travel in. */
exports.ARGS_KEY = 'JSONUI_TEST_ARGS';
/**
 * Cross-platform permission names mapped to Playwright permission names.
 * photos / contacts / calendar / bluetooth have no web permission equivalent and are ignored.
 */
const WEB_PERMISSION_MAP = {
    camera: 'camera',
    microphone: 'microphone',
    location: 'geolocation',
    notifications: 'notifications'
};
/** True for a page with no origin to hold storage (nothing navigated yet). */
function isBlank(url) {
    return !url || url === 'about:blank';
}
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
async function applyLaunchToPage(page, launch) {
    const url = page.url();
    if (isBlank(url)) {
        throw new Error(`launch is applied on the page under test, and the page is on '${url || '(none)'}'. ` +
            'Navigate to the screen before running the file.');
    }
    const context = page.context();
    if (launch?.clearState) {
        await context.clearCookies();
        await page.evaluate(() => {
            window.localStorage.clear();
            window.sessionStorage.clear();
        });
    }
    if (launch?.permissions) {
        const entries = Object.entries(launch.permissions);
        if (entries.some(([, value]) => value === 'deny' || value === 'unset')) {
            await context.clearPermissions();
        }
        const granted = entries
            .filter(([name, value]) => value === 'allow' && WEB_PERMISSION_MAP[name] !== undefined)
            .map(([name]) => WEB_PERMISSION_MAP[name]);
        if (granted.length > 0) {
            await context.grantPermissions(granted, { origin: new URL(url).origin });
        }
    }
    const args = launch?.arguments;
    await page.evaluate(([key, json]) => {
        if (json === null)
            window.sessionStorage.removeItem(key);
        else
            window.sessionStorage.setItem(key, json);
    }, [exports.ARGS_KEY, args === undefined ? null : JSON.stringify(args)]);
}
/**
 * End of a file: remove what the runner put in sessionStorage so the next file
 * starts without it. A page with no origin has nothing to remove.
 */
async function clearTestStorage(page) {
    if (isBlank(page.url()))
        return;
    await page.evaluate(([a, b]) => {
        window.sessionStorage.removeItem(a);
        window.sessionStorage.removeItem(b);
    }, [exports.ARGS_KEY, InitialState_1.INITIAL_STATE_KEY]);
}
//# sourceMappingURL=LaunchConfig.js.map