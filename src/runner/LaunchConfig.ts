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
import { INITIAL_STATE_KEY } from './InitialState';

/** sessionStorage key the arguments travel in. */
export const ARGS_KEY = 'JSONUI_TEST_ARGS';

/**
 * Cross-platform permission names mapped to Playwright permission names.
 * photos / contacts / calendar / bluetooth have no web permission equivalent and are ignored.
 */
const WEB_PERMISSION_MAP: Record<string, string> = {
  camera: 'camera',
  microphone: 'microphone',
  location: 'geolocation',
  notifications: 'notifications'
};

/** True for a page with no origin to hold storage (nothing navigated yet). */
export function isBlank(url: string): boolean {
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
export async function applyLaunchToPage(page: Page, launch: LaunchConfig | undefined): Promise<void> {
  const url = page.url();
  if (isBlank(url)) {
    throw new Error(
      `launch is applied on the page under test, and the page is on '${url || '(none)'}'. ` +
      'Navigate to the screen before running the file.'
    );
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
  await page.evaluate(
    ([key, json]) => {
      if (json === null) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, json);
    },
    [ARGS_KEY, args === undefined ? null : JSON.stringify(args)] as [string, string | null]
  );
}

/**
 * End of a file: remove what the runner put in sessionStorage so the next file
 * starts without it. A page with no origin has nothing to remove.
 */
export async function clearTestStorage(page: Page): Promise<void> {
  if (isBlank(page.url())) return;
  await page.evaluate(([a, b]) => {
    window.sessionStorage.removeItem(a);
    window.sessionStorage.removeItem(b);
  }, [ARGS_KEY, INITIAL_STATE_KEY] as [string, string]);
}
