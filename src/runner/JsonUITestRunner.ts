/**
 * JsonUI Test Runner - Web Driver
 * Main test runner using Playwright
 */

import { Page } from 'playwright';
import { ActionExecutor } from '../actions/ActionExecutor';
import { AssertionExecutor } from '../assertions/AssertionExecutor';
import {
  LoadedTest,
  ScreenTest,
  FlowTest,
  TestCase,
  TestStep,
  FlowTestStep,
  TestResult,
  TestSuiteResult,
  platformIncludes,
  isAction,
  isAssertion
} from '../models/types';

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

const DEFAULT_CONFIG: Required<TestRunnerConfig> = {
  defaultTimeout: 5000,
  screenshotOnFailure: true,
  screenshotDir: './screenshots',
  platform: 'web',
  verbose: false
};

/**
 * Main test runner for JsonUI tests
 */
export class JsonUITestRunner {
  private config: Required<TestRunnerConfig>;
  private page: Page;
  private actionExecutor: ActionExecutor;
  private assertionExecutor: AssertionExecutor;

  constructor(page: Page, config: TestRunnerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.page = page;
    this.actionExecutor = new ActionExecutor(page, this.config.defaultTimeout);
    this.assertionExecutor = new AssertionExecutor(page, this.config.defaultTimeout);
  }

  /**
   * Run a loaded test
   */
  async run(test: LoadedTest): Promise<TestSuiteResult> {
    switch (test.type) {
      case 'screen':
        return this.runScreenTest(test.test, test.filePath);
      case 'flow':
        return this.runFlowTest(test.test, test.filePath);
    }
  }

  /**
   * Run a screen test
   */
  async runScreenTest(test: ScreenTest, _testPath: string = ''): Promise<TestSuiteResult> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    // Wait for UI to be ready
    this.log('Waiting for UI to be ready...');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500);

    // Check platform compatibility
    if (!platformIncludes(test.platform, this.config.platform)) {
      this.log('Skipping test - platform mismatch');
      return {
        suiteName: test.metadata.name,
        results: [],
        totalDurationMs: 0
      };
    }

    // Run setup
    if (test.setup) {
      this.log('Running setup...');
      try {
        await this.executeSteps(test.setup);
      } catch (error) {
        this.log(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    // Run test cases
    for (const testCase of test.cases) {
      const result = await this.runTestCase(test.metadata.name, testCase);
      results.push(result);
    }

    // Run teardown
    if (test.teardown) {
      this.log('Running teardown...');
      try {
        await this.executeSteps(test.teardown);
      } catch (error) {
        this.log(`Teardown failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const totalDuration = Date.now() - startTime;

    return {
      suiteName: test.metadata.name,
      results,
      totalDurationMs: totalDuration
    };
  }

  /**
   * Run a flow test
   */
  async runFlowTest(test: FlowTest, _testPath: string = ''): Promise<TestSuiteResult> {
    const startTime = Date.now();

    // Check platform compatibility
    if (!platformIncludes(test.platform, this.config.platform)) {
      this.log('Skipping flow test - platform mismatch');
      return {
        suiteName: test.metadata.name,
        results: [],
        totalDurationMs: 0
      };
    }

    const result = await (async (): Promise<TestResult> => {
      try {
        // Run setup
        if (test.setup) {
          this.log('Running flow setup...');
          await this.executeFlowSteps(test.setup);
        }

        // Run flow steps
        this.log('Running flow steps...');
        await this.executeFlowSteps(test.steps);

        // Run teardown
        if (test.teardown) {
          this.log('Running flow teardown...');
          await this.executeFlowSteps(test.teardown);
        }

        return {
          testName: test.metadata.name,
          caseName: 'flow',
          passed: true,
          durationMs: Date.now() - startTime
        };
      } catch (error) {
        this.log(`Flow test failed: ${error instanceof Error ? error.message : String(error)}`);
        return {
          testName: test.metadata.name,
          caseName: 'flow',
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime
        };
      }
    })();

    return {
      suiteName: test.metadata.name,
      results: [result],
      totalDurationMs: Date.now() - startTime
    };
  }

  private async runTestCase(testName: string, testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();

    // Check if skipped
    if (testCase.skip) {
      this.log(`Skipping case: ${testCase.name}`);
      return {
        testName,
        caseName: testCase.name,
        passed: true,
        durationMs: 0
      };
    }

    // Check platform compatibility
    if (!platformIncludes(testCase.platform, this.config.platform)) {
      this.log(`Skipping case ${testCase.name} - platform mismatch`);
      return {
        testName,
        caseName: testCase.name,
        passed: true,
        durationMs: 0
      };
    }

    this.log(`Running case: ${testCase.name}`);

    try {
      await this.executeSteps(testCase.steps);
      return {
        testName,
        caseName: testCase.name,
        passed: true,
        durationMs: Date.now() - startTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Case ${testCase.name} failed: ${errorMessage}`);

      if (this.config.screenshotOnFailure) {
        await this.takeScreenshot(`failure_${testName}_${testCase.name}`);
      }

      return {
        testName,
        caseName: testCase.name,
        passed: false,
        error: errorMessage,
        durationMs: Date.now() - startTime
      };
    }
  }

  private async executeSteps(steps: TestStep[]): Promise<void> {
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      this.log(`  Step ${index + 1}: ${this.stepDescription(step)}`);
      await this.executeStep(step);
    }
  }

  private async executeFlowSteps(steps: FlowTestStep[]): Promise<void> {
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      this.log(`  Flow step ${index + 1}: screen=${step.screen}`);
      await this.executeFlowStep(step);
    }
  }

  private async executeStep(step: TestStep): Promise<void> {
    if (isAction(step)) {
      await this.actionExecutor.execute(step);
    } else if (isAssertion(step)) {
      await this.assertionExecutor.execute(step);
    } else {
      throw new Error("Step must have either 'action' or 'assert'");
    }
  }

  private async executeFlowStep(step: FlowTestStep): Promise<void> {
    // Convert FlowTestStep to TestStep and execute
    const testStep: TestStep = {
      action: step.action as TestStep['action'],
      assert: step.assert as TestStep['assert'],
      id: step.id,
      ids: step.ids,
      value: step.value,
      direction: step.direction,
      duration: step.duration,
      timeout: step.timeout,
      ms: step.ms,
      name: step.name,
      equals: step.equals,
      contains: step.contains,
      path: step.path,
      amount: step.amount
    };
    await this.executeStep(testStep);
  }

  private stepDescription(step: TestStep): string {
    if (step.action) {
      return `action=${step.action}, id=${step.id ?? step.ids?.join(',') ?? '-'}`;
    }
    if (step.assert) {
      return `assert=${step.assert}, id=${step.id ?? '-'}`;
    }
    return 'unknown step';
  }

  private async takeScreenshot(name: string): Promise<void> {
    try {
      const path = `${this.config.screenshotDir}/${name}.png`;
      await this.page.screenshot({ path });
      this.log(`Screenshot saved: ${path}`);
    } catch (error) {
      this.log(`Failed to take screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[JsonUITestRunner] ${message}`);
    }
  }
}

/**
 * Builder for creating test runner instances
 */
export class TestRunnerBuilder {
  private config: TestRunnerConfig = {};

  defaultTimeout(timeout: number): this {
    this.config.defaultTimeout = timeout;
    return this;
  }

  screenshotOnFailure(enabled: boolean): this {
    this.config.screenshotOnFailure = enabled;
    return this;
  }

  screenshotDir(dir: string): this {
    this.config.screenshotDir = dir;
    return this;
  }

  verbose(enabled: boolean): this {
    this.config.verbose = enabled;
    return this;
  }

  build(page: Page): JsonUITestRunner {
    return new JsonUITestRunner(page, this.config);
  }
}
