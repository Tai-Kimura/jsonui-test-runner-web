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
    constructor(page: Page, defaultTimeout?: number);
    /**
     * Execute an action step
     */
    execute(step: TestStep): Promise<void>;
    private executeTap;
    private executeDoubleTap;
    private executeLongPress;
    private executeInput;
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