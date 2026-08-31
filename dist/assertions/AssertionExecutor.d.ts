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
    /**
     * Cross-screen waits are legitimately slower than in-screen ones: real
     * suites already hand-write 15-20s after a cold start. Kept distinct from
     * defaultTimeout so raising one does not silently raise the other.
     */
    private screenTransitionTimeout;
    private stateProvider?;
    private baselineDir;
    private updateBaselines;
    /** Warnings produced by the current step (e.g. baseline created); drained by the runner */
    warnings: string[];
    constructor(page: Page, defaultTimeout?: number, options?: {
        stateProvider?: StateProvider;
        baselineDir?: string;
        updateBaselines?: boolean;
        screenTransitionTimeout?: number;
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
    /**
     * `assert: "screen"` — the named screen IS DISPLAYED.
     *
     * Not "displayed exclusively": embedded screens, split panes and tab hosts
     * legitimately show several markers at once, so this only ever looks at the
     * target's own marker.
     *
     * Measured with React 19 SSR + a suspending transition: a client-side swap
     * never exposes two screens' markers at once, and a pending transition
     * never mounts the destination's marker early — while it is pending, NO
     * marker is present. So the predicate needs no exclusivity test and no
     * transition handling, and a zero-marker reading is only meaningful once
     * the timeout has expired.
     *
     * Known limitation (measured, deliberately not part of the predicate):
     * server-rendered markup carries the marker before hydration, so on the
     * FIRST document load this can pass while clicks are still being dropped.
     * React exposes no standard "hydrated" signal, so gating on one is not
     * implementable; it does not recur on client-side navigation.
     */
    private assertScreen;
    /**
     * Wait until the named screen's marker is displayed. Public because the
     * runner's readiness gate needs the same predicate and, more importantly,
     * the same diagnosis: a second implementation would answer "not ready"
     * where this one answers "built for production" or "navigation went
     * elsewhere", and those are the sentences that end the investigation.
     *
     * Throws the last diagnosis on timeout.
     */
    waitForScreenMarker(screenId: string, timeout: number): Promise<void>;
    /**
     * Canonical failure classes. The class names the likely CAUSE, not a
     * severity — every one of them fails the assertion just the same. A missing
     * marker anywhere points at the build (production build or stale generated
     * code), while the previous screen still being the only one present points
     * at the app or the test: the navigation did not happen.
     */
    private screenDiagnosis;
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