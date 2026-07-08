/**
 * JsonUI Test Runner - Web Driver
 * Main test runner using Playwright
 */
import { Page } from 'playwright';
import { LoadedTest, ScreenTest, FlowTest, TestSuiteResult } from '../models/types';
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
}
/**
 * Main test runner for JsonUI tests
 */
export declare class JsonUITestRunner {
    private config;
    private page;
    private actionExecutor;
    private assertionExecutor;
    /** Runtime variables written by readText, shared with the action executor */
    private variables;
    constructor(page: Page, config?: TestRunnerConfig);
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
     */
    private evaluateCondition;
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
    verbose(enabled: boolean): this;
    build(page: Page): JsonUITestRunner;
}
//# sourceMappingURL=JsonUITestRunner.d.ts.map