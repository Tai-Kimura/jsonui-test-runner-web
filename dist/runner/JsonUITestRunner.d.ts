/**
 * JsonUI Test Runner - Web Driver
 * Main test runner using Playwright
 */
import { Page } from 'playwright';
import { LoadedTest, ScreenTest, FlowTest, TestSuiteResult } from '../models/types';
/**
 * Configuration for the test runner
 */
export interface TestRunnerConfig {
    defaultTimeout?: number;
    screenshotOnFailure?: boolean;
    screenshotDir?: string;
    platform?: string;
    verbose?: boolean;
}
/**
 * Main test runner for JsonUI tests
 */
export declare class JsonUITestRunner {
    private config;
    private page;
    private actionExecutor;
    private assertionExecutor;
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
    private executeFlowSteps;
    private executeStep;
    private executeFlowStep;
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
    verbose(enabled: boolean): this;
    build(page: Page): JsonUITestRunner;
}
//# sourceMappingURL=JsonUITestRunner.d.ts.map