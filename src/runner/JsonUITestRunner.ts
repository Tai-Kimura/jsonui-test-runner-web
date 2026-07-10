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
  WhenCondition,
  ResponsiveCondition,
  ResponsiveThresholds,
  platformIncludes,
  matchesResponsive,
  resolveViewportSize,
  unknownConditionKeys,
  deepEquals,
  isAction,
  isAssertion,
  isFileReference,
  isBlockStep
} from '../models/types';
import { TestLoader } from './TestLoader';
import { StateProvider } from './StateProvider';
import { MockClient } from './MockClient';

/** Safety cap for `repeat` with a `while` condition and no `times` */
const REPEAT_WHILE_CAP = 100;

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

type OptionalConfigKeys = 'stateProvider' | 'mockServerUrl' | 'mockToken';
type ResolvedConfig =
  Required<Omit<TestRunnerConfig, OptionalConfigKeys | 'responsive'>> &
  Pick<TestRunnerConfig, OptionalConfigKeys> &
  { responsive: ResponsiveThresholds };

const DEFAULT_CONFIG: ResolvedConfig = {
  defaultTimeout: 5000,
  screenshotOnFailure: true,
  screenshotDir: './screenshots',
  platform: 'web',
  verbose: false,
  stateProvider: undefined,
  baselineDir: './baselines',
  updateBaselines: false,
  mockServerUrl: undefined,
  mockToken: undefined,
  responsive: { medium: 768, regular: 1024 }
};

/**
 * Main test runner for JsonUI tests
 */
export class JsonUITestRunner {
  private config: ResolvedConfig;
  private page: Page;
  private actionExecutor: ActionExecutor;
  private assertionExecutor: AssertionExecutor;
  private mockClient: MockClient | null;
  /** Runtime variables written by readText, shared with the action executor */
  private variables: Record<string, string> = {};

  constructor(page: Page, config: TestRunnerConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      responsive: { ...DEFAULT_CONFIG.responsive, ...config.responsive }
    };
    this.page = page;
    this.actionExecutor = new ActionExecutor(page, this.config.defaultTimeout, this.variables);
    this.assertionExecutor = new AssertionExecutor(page, this.config.defaultTimeout, {
      stateProvider: this.config.stateProvider,
      baselineDir: this.config.baselineDir,
      updateBaselines: this.config.updateBaselines
    });
    this.mockClient = (this.config.mockServerUrl && this.config.mockToken)
      ? new MockClient(page.request, this.config.mockServerUrl, this.config.mockToken)
      : null;
  }

  /** Return the configured mock client or throw a clear setup error. */
  private requireMockClient(feature: string): MockClient {
    if (!this.mockClient) {
      throw new Error(
        `'${feature}' requires a mock server: set mockServerUrl + mockToken in the runner config ` +
        `(from 'jsonui-test mock serve').`
      );
    }
    return this.mockClient;
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

    // Check platform compatibility. Emit a skipped row per case (not results: [])
    // so file-level skips stay visible in the report — "no silent truncation".
    if (!platformIncludes(test.platform, this.config.platform)) {
      this.log('Skipping test - platform mismatch');
      return {
        suiteName: test.metadata.name,
        results: test.cases.map(testCase => ({
          testName: test.metadata.name,
          caseName: testCase.name,
          passed: true,
          skipped: true,
          skipReason: 'platform' as const,
          durationMs: 0
        })),
        totalDurationMs: 0
      };
    }

    // Apply the file-level mock scenario set BEFORE the screen fetches, then reload
    // so the screen re-renders against the selected scenarios. (Scenario switching is
    // per-file for screen tests; there is no per-case re-open — see plan §8.1.)
    if (test.mocks) {
      this.log('Applying mock scenarios and reloading...');
      await this.requireMockClient('mocks').scenarioSet(test.mocks);
      await this.page.reload();
    }

    // Wait for UI to be ready
    this.log('Waiting for UI to be ready...');
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(500);

    // Run setup. If setup throws, every case is recorded as failed but teardown still runs.
    let setupError: string | null = null;
    if (test.setup) {
      this.log('Running setup...');
      try {
        await this.executeSteps(test.setup, []);
      } catch (error) {
        setupError = error instanceof Error ? error.message : String(error);
        this.log(`Setup failed: ${setupError}`);
      }
    }

    // Run test cases
    for (const testCase of test.cases) {
      if (setupError !== null) {
        results.push({
          testName: test.metadata.name,
          caseName: testCase.name,
          passed: false,
          error: `setup failed: ${setupError}`,
          durationMs: 0
        });
        continue;
      }
      const result = await this.runTestCase(test.metadata.name, testCase);
      results.push(result);
    }

    // Run teardown (guaranteed). A teardown failure is recorded as an extra failed result.
    if (test.teardown) {
      this.log('Running teardown...');
      try {
        await this.executeSteps(test.teardown, []);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Teardown failed: ${message}`);
        results.push({
          testName: test.metadata.name,
          caseName: 'teardown',
          passed: false,
          error: message,
          durationMs: 0
        });
      }
    }

    // Reset mock scenarios so state does not leak into the next test file.
    if (test.mocks && this.mockClient) {
      try {
        await this.mockClient.reset();
      } catch (error) {
        this.log(`Mock reset failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      suiteName: test.metadata.name,
      results,
      totalDurationMs: Date.now() - startTime
    };
  }

  /**
   * Run a flow test
   */
  async runFlowTest(test: FlowTest, _testPath: string = ''): Promise<TestSuiteResult> {
    const startTime = Date.now();

    // Check platform compatibility. Emit a skipped row (not results: []) so the
    // flow-level skip stays visible in the report — "no silent truncation".
    if (!platformIncludes(test.platform, this.config.platform)) {
      this.log('Skipping flow test - platform mismatch');
      return {
        suiteName: test.metadata.name,
        results: [{
          testName: test.metadata.name,
          caseName: 'flow',
          passed: true,
          skipped: true,
          skipReason: 'platform',
          durationMs: 0
        }],
        totalDurationMs: 0
      };
    }

    const results: TestResult[] = [];
    const warnings: string[] = [];
    let flowError: string | null = null;

    try {
      // Run setup
      if (test.setup) {
        this.log('Running flow setup...');
        await this.executeFlowSteps(test.setup, warnings);
      }

      // Run flow steps
      this.log('Running flow steps...');
      await this.executeFlowSteps(test.steps, warnings);
    } catch (error) {
      flowError = error instanceof Error ? error.message : String(error);
      this.log(`Flow test failed: ${flowError}`);
    }

    results.push({
      testName: test.metadata.name,
      caseName: 'flow',
      passed: flowError === null,
      error: flowError ?? undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      durationMs: Date.now() - startTime
    });

    // Run teardown (guaranteed)
    if (test.teardown) {
      this.log('Running flow teardown...');
      try {
        await this.executeFlowSteps(test.teardown, []);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Flow teardown failed: ${message}`);
        results.push({
          testName: test.metadata.name,
          caseName: 'teardown',
          passed: false,
          error: message,
          durationMs: 0
        });
      }
    }

    // Reset mock scenarios so a flow's setMocks state does not leak to the next test.
    if (this.mockClient) {
      try {
        await this.mockClient.reset();
      } catch (error) {
        this.log(`Mock reset failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      suiteName: test.metadata.name,
      results,
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
        skipped: true,
        durationMs: 0
      };
    }

    // Check platform compatibility. Deterministic skip-reason rule: platform is
    // evaluated BEFORE responsive, so when a case carries both gates and both
    // are unmet, `skipReason` is 'platform' (the static gate wins over the
    // viewport-dependent one, keeping reports stable across viewport sizes).
    if (!platformIncludes(testCase.platform, this.config.platform)) {
      this.log(`Skipping case ${testCase.name} - platform mismatch`);
      return {
        testName,
        caseName: testCase.name,
        passed: true,
        skipped: true,
        skipReason: 'platform',
        durationMs: 0
      };
    }

    // Check responsive compatibility (case-level gate, parallel to platform)
    if (testCase.responsive !== undefined && !(await this.currentSizeMatches(testCase.responsive))) {
      this.log(`Skipping case ${testCase.name} - responsive mismatch`);
      return {
        testName,
        caseName: testCase.name,
        passed: true,
        skipped: true,
        skipReason: 'responsive',
        durationMs: 0
      };
    }

    this.log(`Running case: ${testCase.name}`);

    // Apply load-time args substitution if test case has args
    const processedCase = TestLoader.applyArgsSubstitution(testCase);
    const warnings: string[] = [];

    try {
      await this.executeSteps(processedCase.steps, warnings);
      return {
        testName,
        caseName: testCase.name,
        passed: true,
        warnings: warnings.length > 0 ? warnings : undefined,
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
        warnings: warnings.length > 0 ? warnings : undefined,
        durationMs: Date.now() - startTime
      };
    }
  }

  private async executeSteps(steps: TestStep[], warnings: string[]): Promise<void> {
    for (let index = 0; index < steps.length; index++) {
      const rawStep = steps[index];
      // Resolve runtime variables (@{name}) at execution time, after load-time args
      const step = TestLoader.substituteRuntimeVariables(rawStep, this.variables);
      this.log(`  Step ${index + 1}: ${this.stepDescription(step)}`);
      await this.executeStepGuarded(step, warnings);
    }
  }

  /**
   * Execute a single step honoring `when` (skip), `optional` (failure→warning),
   * and control steps (repeat/retry).
   */
  private async executeStepGuarded(step: TestStep, warnings: string[]): Promise<void> {
    // Evaluate `when` pre-condition
    if (step.when && !(await this.evaluateCondition(step.when))) {
      this.log(`    Skipped (when not satisfied): ${step.label ?? this.stepDescription(step)}`);
      return;
    }

    try {
      await this.executeStep(step, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (step.optional) {
        const label = step.label ?? this.stepDescription(step);
        warnings.push(`optional step failed (${label}): ${message}`);
        this.log(`    Optional step failed, continuing: ${message}`);
        return;
      }
      throw error;
    }
  }

  private async executeStep(step: TestStep, warnings: string[]): Promise<void> {
    // Control steps
    if (step.action === 'repeat') {
      await this.executeRepeat(step, warnings);
      return;
    }
    if (step.action === 'retry') {
      await this.executeRetry(step, warnings);
      return;
    }
    if (step.action === 'setMocks') {
      // Switch scenarios mid-flow; the next navigation re-fetches under them.
      await this.requireMockClient('setMocks').scenarioSet(step.mocks ?? {});
      return;
    }

    if (isAction(step)) {
      await this.actionExecutor.execute(step);
    } else if (isAssertion(step)) {
      await this.assertionExecutor.execute(step);
      // Drain warnings produced by the assertion (e.g. baseline created)
      if (this.assertionExecutor.warnings.length > 0) {
        warnings.push(...this.assertionExecutor.warnings);
        this.assertionExecutor.warnings = [];
      }
    } else {
      throw new Error("Step must have either 'action' or 'assert'");
    }
  }

  private async executeRepeat(step: TestStep, warnings: string[]): Promise<void> {
    const steps = step.steps ?? [];
    const hasTimes = typeof step.times === 'number';
    const hasWhile = step.while !== undefined;

    if (hasTimes && hasWhile) {
      // Loop while condition holds, at most `times` iterations (times is the cap)
      for (let i = 0; i < (step.times as number); i++) {
        if (!(await this.evaluateCondition(step.while as WhenCondition))) {
          return;
        }
        await this.executeSteps(steps, warnings);
      }
      return;
    }

    if (hasTimes) {
      for (let i = 0; i < (step.times as number); i++) {
        await this.executeSteps(steps, warnings);
      }
      return;
    }

    // while only: safety cap of REPEAT_WHILE_CAP
    for (let i = 0; i < REPEAT_WHILE_CAP; i++) {
      if (!(await this.evaluateCondition(step.while as WhenCondition))) {
        return;
      }
      await this.executeSteps(steps, warnings);
    }
    // Cap reached while the condition still holds
    if (await this.evaluateCondition(step.while as WhenCondition)) {
      throw new Error(`repeat exceeded ${REPEAT_WHILE_CAP} iterations (possible infinite loop)`);
    }
  }

  private async executeRetry(step: TestStep, warnings: string[]): Promise<void> {
    const steps = step.steps ?? [];
    const maxRetries = Math.min(step.maxRetries ?? 1, 3);
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Retried steps must NOT leak partial warnings on a failed attempt
        const attemptWarnings: string[] = [];
        await this.executeSteps(steps, attemptWarnings);
        warnings.push(...attemptWarnings);
        return;
      } catch (error) {
        lastError = error;
        this.log(`    Retry attempt ${attempt + 1}/${maxRetries + 1} failed`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Evaluate a `when` / `while` condition. Multiple keys are ANDed.
   *
   * Fail-safe: a condition containing any key outside KNOWN_CONDITION_KEYS
   * (e.g. written against a newer schema than this driver) is UNMET — the step
   * skips. Never run-anyway (false-green at the wrong state), never throw.
   */
  private async evaluateCondition(condition: WhenCondition): Promise<boolean> {
    const unknown = unknownConditionKeys(condition);
    if (unknown.length > 0) {
      this.log(`    Condition has unsupported key(s) [${unknown.join(', ')}] - treating as unmet (fail-safe skip)`);
      return false;
    }
    if (condition.platform !== undefined) {
      if (!platformIncludes(condition.platform, this.config.platform)) {
        return false;
      }
    }
    if (condition.responsive !== undefined) {
      if (!(await this.currentSizeMatches(condition.responsive))) {
        return false;
      }
    }
    if (condition.visible !== undefined) {
      if (!(await this.isInstantlyVisible(condition.visible))) {
        return false;
      }
    }
    if (condition.notVisible !== undefined) {
      if (await this.isInstantlyVisible(condition.notVisible)) {
        return false;
      }
    }
    if (condition.state !== undefined) {
      if (!this.config.stateProvider) {
        throw new Error(
          `Cannot evaluate state condition '${condition.state.path}': no state provider configured`
        );
      }
      const actual = await this.config.stateProvider.getValue(condition.state.path);
      if (!deepEquals(actual, condition.state.equals)) {
        return false;
      }
    }
    return true;
  }

  /**
   * True when the current viewport size satisfies a `responsive` condition.
   * Reads the live size on every evaluation so setViewport/setOrientation
   * changes are picked up immediately.
   */
  private async currentSizeMatches(condition: ResponsiveCondition): Promise<boolean> {
    const size = await resolveViewportSize(this.page);
    return matchesResponsive(condition, size, this.config.responsive);
  }

  /** Instant visibility check (no polling) used by conditions */
  private async isInstantlyVisible(id: string): Promise<boolean> {
    const element = this.page.locator(`#${id}`);
    if (await element.count() === 0) {
      return false;
    }
    return element.first().isVisible();
  }

  private async executeFlowSteps(steps: FlowTestStep[], warnings: string[]): Promise<void> {
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (isFileReference(step)) {
        this.log(`  Flow step ${index + 1}: file=${step.file}`);
      } else if (isBlockStep(step)) {
        this.log(`  Flow step ${index + 1}: block=${step.block}`);
      } else {
        this.log(`  Flow step ${index + 1}: screen=${step.screen}`);
      }
      await this.executeFlowStep(step, warnings);
    }
  }

  private async executeFlowStep(step: FlowTestStep, warnings: string[]): Promise<void> {
    // Evaluate step-level `when` for file/block/inline steps
    if (step.when && !(await this.evaluateCondition(step.when))) {
      this.log(`    Skipped flow step (when not satisfied)`);
      return;
    }

    // Handle file reference steps
    if (isFileReference(step)) {
      await this.executeFileReferenceStep(step, warnings);
      return;
    }

    // Handle block steps (grouped inline actions)
    if (isBlockStep(step)) {
      await this.executeBlockStep(step, warnings);
      return;
    }

    // Handle inline steps - convert FlowTestStep to TestStep and execute
    await this.executeStepGuarded(this.toTestStep(step), warnings);
  }

  private async executeBlockStep(step: FlowTestStep, warnings: string[]): Promise<void> {
    const blockSteps = step.steps;
    if (!blockSteps) {
      return;
    }
    this.log(`    Executing block: ${step.block}`);
    for (const innerStep of blockSteps) {
      await this.executeStepGuarded(this.toTestStep(innerStep), warnings);
    }
  }

  private async executeFileReferenceStep(step: FlowTestStep, warnings: string[]): Promise<void> {
    const testCases = TestLoader.resolveFileReferenceCases(step);

    for (const testCase of testCases) {
      // Skip if marked to skip
      if (testCase.skip) {
        this.log(`    Skipping case: ${testCase.name}`);
        continue;
      }

      // Check platform compatibility
      if (!platformIncludes(testCase.platform, this.config.platform)) {
        this.log(`    Skipping case ${testCase.name} - platform mismatch`);
        continue;
      }

      // Check responsive compatibility (case-level gate, parallel to platform)
      if (testCase.responsive !== undefined && !(await this.currentSizeMatches(testCase.responsive))) {
        this.log(`    Skipping case ${testCase.name} - responsive mismatch`);
        continue;
      }

      this.log(`    Running referenced case: ${testCase.name}`);
      await this.executeSteps(testCase.steps, warnings);
    }
  }

  /** Convert a FlowTestStep (inline / block child) into a TestStep for execution */
  private toTestStep(step: FlowTestStep): TestStep {
    return {
      action: step.action as TestStep['action'],
      assert: step.assert as TestStep['assert'],
      id: step.id,
      ids: step.ids,
      text: step.text,
      value: step.value,
      direction: step.direction,
      duration: step.duration,
      timeout: step.timeout,
      ms: step.ms,
      name: step.name,
      equals: step.equals,
      contains: step.contains,
      path: step.path,
      amount: step.amount,
      button: step.button,
      label: step.label,
      index: step.index,
      optional: step.optional,
      when: step.when,
      retryTapIfNoChange: step.retryTapIfNoChange,
      container: step.container,
      variable: step.variable,
      times: step.times,
      while: step.while,
      steps: step.steps?.map(s => this.toTestStep(s)),
      maxRetries: step.maxRetries,
      latitude: step.latitude,
      longitude: step.longitude,
      paths: step.paths,
      cropId: step.cropId,
      threshold: step.threshold,
      mocks: step.mocks,
      width: step.width,
      height: step.height,
      orientation: step.orientation
    };
  }

  private stepDescription(step: TestStep): string {
    if (step.action) {
      return `action=${step.action}, id=${step.id ?? step.ids?.join(',') ?? '-'}`;
    }
    if (step.assert) {
      return `assert=${step.assert}, id=${step.id ?? step.path ?? '-'}`;
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

  stateProvider(provider: StateProvider): this {
    this.config.stateProvider = provider;
    return this;
  }

  baselineDir(dir: string): this {
    this.config.baselineDir = dir;
    return this;
  }

  updateBaselines(enabled: boolean): this {
    this.config.updateBaselines = enabled;
    return this;
  }

  /** Point the runner at a running mock server so `mocks` / `setMocks` work. */
  mockServer(url: string, token: string): this {
    this.config.mockServerUrl = url;
    this.config.mockToken = token;
    return this;
  }

  /**
   * Override named-bucket width thresholds (logical px) for `responsive` gating.
   * Only for projects that also override the renderer's Tailwind breakpoints —
   * bucket names themselves are fixed.
   */
  responsiveThresholds(thresholds: Partial<ResponsiveThresholds>): this {
    this.config.responsive = { ...this.config.responsive, ...thresholds };
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
