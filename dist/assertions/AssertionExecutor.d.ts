/**
 * JsonUI Test Runner - Web Driver
 * Assertion executor using Playwright
 *
 * Uses id attribute for element matching (ReactJsonUI exposes id as HTML id attribute)
 */
import { Page } from 'playwright';
import { TestStep } from '../models/types';
export declare class AssertionExecutor {
    private page;
    private defaultTimeout;
    constructor(page: Page, defaultTimeout?: number);
    /**
     * Execute an assertion step
     */
    execute(step: TestStep): Promise<void>;
    private assertVisible;
    private assertNotVisible;
    private assertEnabled;
    private assertDisabled;
    private assertText;
    private assertCount;
    /**
     * Get locator for element by id attribute
     */
    private getLocator;
    /**
     * Wait for element to appear by id attribute
     */
    private waitForElement;
}
//# sourceMappingURL=AssertionExecutor.d.ts.map