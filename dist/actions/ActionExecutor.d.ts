/**
 * JsonUI Test Runner - Web Driver
 * Action executor using Playwright
 *
 * Uses id attribute for element matching (ReactJsonUI exposes id as HTML id attribute)
 */
import { Page } from 'playwright';
import { TestStep } from '../models/types';
export declare class ActionExecutor {
    private page;
    private defaultTimeout;
    /** Runtime variable store shared with the runner (written by readText) */
    private variables;
    constructor(page: Page, defaultTimeout?: number, variables?: Record<string, string>);
    /**
     * Execute an action step
     */
    execute(step: TestStep): Promise<void>;
    private executeTap;
    private executeDoubleTap;
    private executeLongPress;
    private executeInput;
    /**
     * Type into whatever currently holds keyboard focus — no element id.
     * For fields that are focused but not directly targetable (e.g. an invisible
     * code-entry input behind visible slots). Focus is established app-side
     * (auto-focus or a prior tap); keyboard events route to document.activeElement.
     */
    private executeTypeText;
    private executeClear;
    private executeScroll;
    private executeSwipe;
    private executeWaitFor;
    private executeWaitForAny;
    private executeWait;
    private executeBack;
    /**
     * Dismiss the soft keyboard by blurring the focused element. Under mobile
     * emulation this closes the on-screen keyboard; on desktop it is a
     * harmless blur (cross-platform parity with the ios/android drivers).
     */
    private executeHideKeyboard;
    private executeScreenshot;
    private executeAlertTap;
    private executeSelectOption;
    private executeTapItem;
    private executeSelectTab;
    private executeScrollUntilVisible;
    /**
     * Scroll one step in the given direction. Returns a marker string describing the
     * scroll position after scrolling (used for end-reached detection), or null if unknown.
     */
    private scrollOneStep;
    private executeReadText;
    private executeSetLocation;
    /**
     * Set files on a file input. Paths resolve relative to the test file's
     * directory (TestLoader base path); absolute paths pass through. With an
     * `id`, targets that element (the input itself, or a file input inside
     * it); without one, the page's first input[type=file]. setInputFiles
     * works on hidden inputs (display:none / opacity:0), so the native picker
     * never needs to open.
     */
    private executeAddMedia;
    /**
     * Call a browser-side hook the app registered on window.__jsonuiTestHooks
     * (e.g. an RTDB mock emitter). A limited, declarative alternative to a raw
     * script step: the runner can only invoke hooks the app chose to expose.
     * Web-only — mobile drivers treat emitHook as a no-op with a warning.
     */
    private executeEmitHook;
    /** Resize the viewport to sweep responsive breakpoints (web-native drive) */
    private executeSetViewport;
    /**
     * Rotate to the given orientation by swapping the viewport width/height.
     * Already-matching orientation is a no-op; a `viewport: null` context
     * (headful / --start-maximized) cannot be resized, so it is a no-op with a
     * warning — dependent asserts should self-gate with `when.responsive`.
     */
    private executeSetOrientation;
    /**
     * Get locator for element by id attribute
     */
    private getLocator;
    /**
     * Wait for element to appear by id attribute
     */
    private waitForElement;
    /**
     * Tap on a specific text portion within an element
     * Calculates the approximate position of the target text and clicks there
     */
    private tapTextPortion;
}
//# sourceMappingURL=ActionExecutor.d.ts.map