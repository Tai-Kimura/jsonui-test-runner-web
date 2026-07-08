/**
 * JsonUI Test Runner - Web Driver
 * Launch configuration helper (applied before the app under test starts)
 */
import { BrowserContext } from 'playwright';
import { LaunchConfig } from '../models/types';
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
export declare function applyLaunchConfig(context: BrowserContext, launch: LaunchConfig, originUrl?: string): Promise<void>;
//# sourceMappingURL=LaunchConfig.d.ts.map