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
    /**
     * Get locator for element by id attribute
     */
    private getLocator;
    /**
     * Wait for element to appear by id attribute
     */
    private waitForElement;
}
//# sourceMappingURL=ActionExecutor.d.ts.map