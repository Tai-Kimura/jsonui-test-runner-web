/**
 * JsonUI Test Runner - Web Driver
 * Assertion executor using Playwright
 *
 * Uses id attribute for element matching (ReactJsonUI exposes id as HTML id attribute)
 *
 * All element assertions auto-wait: they poll the condition every 100ms until it
 * holds or the timeout (step.timeout ?? defaultTimeout) elapses.
 */
import { Page } from 'playwright';
import { TestStep } from '../models/types';
import { StateProvider } from '../runner/StateProvider';
export declare class AssertionExecutor {
    private page;
    private defaultTimeout;
    private stateProvider?;
    private baselineDir;
    private updateBaselines;
    /** Warnings produced by the current step (e.g. baseline created); drained by the runner */
    warnings: string[];
    constructor(page: Page, defaultTimeout?: number, options?: {
        stateProvider?: StateProvider;
        baselineDir?: string;
        updateBaselines?: boolean;
    });
    /**
     * Execute an assertion step
     */
    execute(step: TestStep): Promise<void>;
    /**
     * Poll `check` every POLL_INTERVAL_MS until it returns null (pass) or the timeout
     * elapses. `check` returns an error message string while the condition is unmet.
     * The last error message is thrown on timeout.
     */
    private pollUntil;
    private assertVisible;
    private assertNotVisible;
    private assertEnabled;
    private assertDisabled;
    private assertText;
    private assertCount;
    private assertState;
    /**
     * Assert against the most recent window.open call recorded by the runner's
     * spy (installed on every document). Auto-waits like element assertions so
     * an open triggered by an async handler still lands within the timeout.
     * Web-only — gate with when.platform in cross-platform tests.
     */
    private assertOpenedUrl;
    private assertScreenshot;
    private requireId;
    /**
     * Get locator for element by id attribute
     */
    private getLocator;
    private isElementDisabled;
    private readElementText;
}
//# sourceMappingURL=AssertionExecutor.d.ts.map