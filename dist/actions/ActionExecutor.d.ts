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
    private executeAddMedia;
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