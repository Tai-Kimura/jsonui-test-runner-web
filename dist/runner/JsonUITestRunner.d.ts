/**
 * JsonUI Test Runner - Web Driver
 * Main test runner using Playwright
 */
import { Page } from 'playwright';
import { LoadedTest, ScreenTest, FlowTest, TestSuiteResult, ResponsiveThresholds } from '../models/types';
import { StateProvider } from './StateProvider';
/**
 * Configuration for the test runner
 */
export interface TestRunnerConfig {
    defaultTimeout?: number;
    /**
     * Verify the screen marker automatically whenever a flow's inline step
     * moves to a different `screen`, without the test spelling an assertion.
     * ON by default — this is the canonical behaviour.
     *
     * An app whose generated code predates screen markers will fail every
     * screen change with `marker-absent`. That is the intended signal: the app
     * needs `jui build` and a current build. Set this to false to opt out while
     * migrating.
     */
    verifyScreenTransitions?: boolean;
    /**
     * Timeout for those implicit verifications. Deliberately larger than
     * defaultTimeout: real cross-screen waits already use 15-20s after a cold
     * start.
     */
    screenTransitionTimeout?: number;
    screenshotOnFailure?: boolean;
    screenshotDir?: string;
    platform?: string;
    verbose?: boolean;
    /**
     * Extra attempts for a FAILED case (or flow body) before recording the
     * failure — 0 (default) keeps single-run behaviour. The final result
     * carries `attempts` (total runs) and a pass after a retry is marked
     * `flaky` in the results JSON. Retries re-run the case steps as-is —
     * there is no per-case re-open (§8.1), so cases that mutate app state
     * non-idempotently may not benefit.
     */
    caseRetries?: number;
    /** Provider for `state` assertions and `state` conditions */
    stateProvider?: StateProvider;
    /** Baseline directory for the `screenshot` assertion (default './baselines') */
    baselineDir?: string;
    /** When true, screenshot baselines are always overwritten and the assertion passes */
    updateBaselines?: boolean;
    /** Mock server base URL (e.g. http://127.0.0.1:8790). Required to use `mocks` / `setMocks`. */
    mockServerUrl?: string;
    /** Admin token printed by `jsonui-test mock serve`. Required with mockServerUrl. */
    mockToken?: string;
    /**
     * Named-bucket width thresholds (logical px) for `responsive` gating.
     * Defaults mirror the web renderer's Tailwind breakpoints (md: 768, lg: 1024).
     * Only thresholds are overridable — and only for projects that also override
     * the renderer's breakpoints; bucket NAMES are fixed (no new/renamed buckets
     * via config).
     */
    responsive?: Partial<ResponsiveThresholds>;
    /**
     * How a screen test decides the UI is ready before setup runs.
     *
     * `'auto'` (default): wait for the screen's own `data-screen` marker when
     * a screen id can be derived from `source.layout`, and fall back to
     * `networkidle` when it cannot (a hand-written page). The fallback always
     * says so on stderr — a silent fallback is the exact failure this gate
     * was rewritten to remove.
     *
     * The marker is a fact about the app, decided by the app. `networkidle`
     * is 500ms of network silence, which is a fact about every resource the
     * page happens to reference: one hung request for a decorative image and
     * it never fires, so a screen that rendered perfectly fails on a bare
     * 30s timeout with nothing else to go on.
     *
     * `'marker'` / `'networkidle'` force one gate. Both announce themselves.
     */
    screenReadyStrategy?: 'auto' | 'marker' | 'networkidle';
    /**
     * Timeout for the marker gate. Larger than defaultTimeout because this is
     * the first paint after a cold dev-server start, the slowest moment in a
     * run.
     */
    screenReadyTimeout?: number;
}
/**
 * Main test runner for JsonUI tests
 */
export declare class JsonUITestRunner {
    private config;
    private page;
    private actionExecutor;
    private assertionExecutor;
    private mockClient;
    /** Runtime variables written by readText, shared with the action executor */
    private variables;
    /**
     * Identity of the test file / case currently executing — embedded into
     * `screenshot` action filenames (parity with failure_<test>_<case> and the
     * iOS/Android drivers) so `jsonui-test artifacts pull` output is
     * self-describing.
     */
    private currentTestName;
    /**
     * The screen the previously executed inline step ran on; undefined means
     * "unknown", which forces the next inline step to be verified.
     */
    private trackedScreen;
    private currentCaseName;
    constructor(page: Page, config?: TestRunnerConfig);
    /**
     * Make sure the CURRENT document has the window.open spy too — the runner
     * may be constructed after the app has already navigated, in which case
     * addInitScript alone would only cover the next navigation.
     */
    private ensureWindowOpenSpy;
    /** Return the configured mock client or throw a clear setup error. */
    private requireMockClient;
    /**
     * Run a loaded test
     */
    run(test: LoadedTest): Promise<TestSuiteResult>;
    /**
     * Run a screen test
     */
    runScreenTest(test: ScreenTest, _testPath?: string): Promise<TestSuiteResult>;
    /**
     * Run a flow test
     */
    runFlowTest(test: FlowTest, _testPath?: string): Promise<TestSuiteResult>;
    /**
     * Run a case, re-running it up to `caseRetries` extra times while it
     * fails. The returned result is the final attempt's, stamped with the
     * total attempt count (skipped rows never ran and carry none).
     */
    private runTestCaseWithRetries;
    private runTestCase;
    private executeSteps;
    /**
     * Execute a single step honoring `when` (skip), `optional` (failure→warning),
     * and control steps (repeat/retry).
     */
    private executeStepGuarded;
    private executeStep;
    private executeRepeat;
    private executeRetry;
    /**
     * Evaluate a `when` / `while` condition. Multiple keys are ANDed.
     *
     * Fail-safe: a condition containing any key outside KNOWN_CONDITION_KEYS
     * (e.g. written against a newer schema than this driver) is UNMET — the step
     * skips. Never run-anyway (false-green at the wrong state), never throw.
     */
    private evaluateCondition;
    /**
     * True when the current viewport size satisfies a `responsive` condition.
     * Reads the live size on every evaluation so setViewport/setOrientation
     * changes are picked up immediately.
     */
    private currentSizeMatches;
    /** Instant visibility check (no polling) used by conditions */
    private isInstantlyVisible;
    private executeFlowSteps;
    /**
     * Implicit screen verification (canon: implicitVerification). Runs BEFORE
     * the step, because the step is meant to run ON that screen.
     */
    private verifyScreenTransitionIfNeeded;
    private executeFlowStep;
    private executeBlockStep;
    private executeFileReferenceStep;
    /** Convert a FlowTestStep (inline / block child) into a TestStep for execution */
    private toTestStep;
    private stepDescription;
    private takeScreenshot;
    private log;
    /**
     * Unconditional counterpart to `log`. Used only where staying quiet is the
     * defect: a run that silently waits on the network gate looks exactly like
     * a run that waited on the marker, right up to the 30s timeout that
     * follows.
     */
    private notice;
    /**
     * Block until the screen under test is on the page.
     *
     * Was `waitForLoadState('networkidle')`: 500ms of network silence. That is
     * a condition on every resource the page references, not on the screen —
     * one request that hangs (a decorative image on somebody else's server)
     * and it never fires. The screen renders correctly, the mocks apply, and
     * the run fails with `Test timeout of 30000ms exceeded` and nothing else,
     * which is the most expensive shape a failure can have: the reporting
     * lane eliminated eight hypotheses before reaching this one.
     *
     * The marker is the same fact the `screen` assertion already reads, so the
     * wait and the assertion agree by construction, and the failure text comes
     * from the one diagnosis that knows about production builds and stale
     * generated code.
     *
     * Waiting for the screen presumes the screen renders, and tests exist whose
     * whole point is that it does not: a permission check that replaces the
     * screen with a refusal, an expired refresh that lands on login. Those
     * declare `screenReady` themselves. The project-wide `screenReadyStrategy`
     * cannot express them — it is one switch for the whole run, so buying seven
     * such tests with it costs the other hundred-odd the protection above.
     */
    private waitForScreenReady;
    /** Wait for one screen marker, or fail with the gate's own context added. */
    private awaitMarker;
}
/**
 * Builder for creating test runner instances
 */
export declare class TestRunnerBuilder {
    private config;
    defaultTimeout(timeout: number): this;
    screenshotOnFailure(enabled: boolean): this;
    screenshotDir(dir: string): this;
    stateProvider(provider: StateProvider): this;
    baselineDir(dir: string): this;
    updateBaselines(enabled: boolean): this;
    /** Point the runner at a running mock server so `mocks` / `setMocks` work. */
    mockServer(url: string, token: string): this;
    /**
     * Override named-bucket width thresholds (logical px) for `responsive` gating.
     * Only for projects that also override the renderer's Tailwind breakpoints —
     * bucket names themselves are fixed.
     */
    responsiveThresholds(thresholds: Partial<ResponsiveThresholds>): this;
    verbose(enabled: boolean): this;
    build(page: Page): JsonUITestRunner;
}
//# sourceMappingURL=JsonUITestRunner.d.ts.map