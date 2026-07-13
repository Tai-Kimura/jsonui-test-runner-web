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
    screenshotOnFailure?: boolean;
    screenshotDir?: string;
    platform?: string;
    verbose?: boolean;
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
    private executeFlowStep;
    private executeBlockStep;
    private executeFileReferenceStep;
    /** Convert a FlowTestStep (inline / block child) into a TestStep for execution */
    private toTestStep;
    private stepDescription;
    private takeScreenshot;
    private log;
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