/**
 * JsonUI Test Runner - Web Driver
 * Launch configuration helper (applied before the app under test starts)
 */

import { BrowserContext } from 'playwright';
import { LaunchConfig } from '../models/types';

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

/**
 * Apply a launch configuration to a browser context.
 * Call this BEFORE navigating to the app under test.
 *
 * - clearState: clears cookies and local/session storage (for originUrl when given,
 *   otherwise for every currently open page)
 * - permissions: 'allow' -> grantPermissions, 'unset' -> clearPermissions first,
 *   'deny' -> not granted (Playwright denies non-granted permissions by default)
 * - arguments: written to sessionStorage["JSONUI_TEST_ARGS"] as JSON via an init
 *   script so the value survives navigation
 */
export async function applyLaunchConfig(
  context: BrowserContext,
  launch: LaunchConfig,
  originUrl?: string
): Promise<void> {
  if (launch.clearState) {
    await context.clearCookies();

    if (originUrl) {
      // Storage is per-origin; open a throwaway page on the origin to clear it
      const page = await context.newPage();
      try {
        await page.goto(originUrl);
        await page.evaluate(() => {
          window.localStorage.clear();
          window.sessionStorage.clear();
        });
      } finally {
        await page.close();
      }
    } else {
      // Best effort: clear storage on every currently open page
      for (const page of context.pages()) {
        try {
          await page.evaluate(() => {
            window.localStorage.clear();
            window.sessionStorage.clear();
          });
        } catch {
          // Pages without an origin (about:blank) cannot access storage - ignore
        }
      }
    }
  }

  if (launch.permissions) {
    const entries = Object.entries(launch.permissions);

    // 'unset' resets to the default (prompt) state; Playwright can only clear all at once
    if (entries.some(([, value]) => value === 'unset')) {
      await context.clearPermissions();
    }

    const granted = entries
      .filter(([name, value]) => value === 'allow' && WEB_PERMISSION_MAP[name] !== undefined)
      .map(([name]) => WEB_PERMISSION_MAP[name]);

    if (granted.length > 0) {
      await context.grantPermissions(granted, originUrl ? { origin: originUrl } : undefined);
    }
  }

  if (launch.arguments) {
    // Runs before any page script on every navigation, so the value survives reloads
    await context.addInitScript((args) => {
      window.sessionStorage.setItem('JSONUI_TEST_ARGS', JSON.stringify(args));
    }, launch.arguments);
  }
}
