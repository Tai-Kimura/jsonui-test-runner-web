/**
 * JsonUI Test Runner - Web Driver
 * Main test runner using Playwright
 */

import * as path from 'path';
import { Page } from 'playwright';
import { ActionExecutor } from '../actions/ActionExecutor';
import { AssertionExecutor } from '../assertions/AssertionExecutor';
import { isHidden, isInViewport } from '../visibility';
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
  ResponsiveOrientation,
  RunDefaults,
  platformIncludes,
  matchesResponsive,
  resolveViewportSize,
  deriveOrientation,
  resolveSizeTier,
  unknownConditionKeys,
  deepEquals,
  isAction,
  isAssertion,
  isFileReference,
  isBlockStep
} from '../models/types';
import { classifyFailure } from './failureReason';
import { TestLoader } from './TestLoader';
import { StateProvider, BridgeStateProvider, lookupState, TRUNCATED_MESSAGE } from './StateProvider';
import { MockClient } from './MockClient';
import { applyLaunchToPage, clearTestStorage } from './LaunchConfig';
import {
  InitialStateScreens,
  caseNeedsReopen,
  caseNeedsReopenMessage,
  flowScreens,
  launchNeeded,
  makePayload,
  referencedInitialStateMessage,
  referencedInitialStateWarnings,
  screenTestScreens,
  writeInitialState
} from './InitialState';
import { waitForReceipt } from './StateBridge';
import { screenIdFromLayout } from './screenIdentity';
import { defaultOrientationForTier } from './RunDefaults';
import { ProgressReporter, PROGRESS_INLINE_FILE } from './ProgressReporter';
import { DefaultResultsSuite, DefaultResultsWriter } from './DefaultResults';

/** Safety cap for `repeat` with a `while` condition and no `times` */
const REPEAT_WHILE_CAP = 100;

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
  /**
   * Run-scoped defaults read from the installed bundle's
   * `jsonui-test-run.json` (see `RunDefaults.loadRunDefaults`). `null` says
   * the sidecar could not be read and is NOT the same as an empty table —
   * a caller that folds the two together loses the only signal that
   * separates "no default declared" from "installed by an older CLI".
   */
  runDefaults?: RunDefaults | null;
  /**
   * Called on every launch (web: §10.2), after clearState, permissions and
   * arguments are applied and before the initialState payload, the mocks and
   * the reload (`goto` on a reopen) — so per case under caseIsolation
   * 'reopen'. The place for what the harness used to do after
   * applyLaunchConfig, e.g. seeding auth cookies that clearState removed.
   * Awaited; a throw fails the launch like any other launch step (screen
   * test: the cases as 'setup'; flow: the flow). Not called when the file
   * has nothing to launch with (no launch, mocks or initialState).
   */
  afterLaunch?: (page: Page) => void | Promise<void>;
  /**
   * Provider for `state` assertions and `state` conditions. Leave it unset:
   * the default reads the state bridge the generated hook publishes
   * (`window.__JSONUI_STATE__[screenId]`). One passed here wins.
   */
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
  /**
   * The tests root the progress records' `file` is relative to (the
   * directory handed to TestLoader.loadFromDirectory, typically). Default:
   * the working directory.
   */
  testsDir?: string;
}

type OptionalConfigKeys =
  'stateProvider' | 'mockServerUrl' | 'mockToken' | 'runDefaults' | 'afterLaunch' | 'testsDir';
type ResolvedConfig =
  Required<Omit<TestRunnerConfig, OptionalConfigKeys | 'responsive'>> &
  Pick<TestRunnerConfig, OptionalConfigKeys> &
  { responsive: ResponsiveThresholds };

const DEFAULT_CONFIG: ResolvedConfig = {
  defaultTimeout: 5000,
  verifyScreenTransitions: true,
  screenTransitionTimeout: 10000,
  screenshotOnFailure: true,
  screenshotDir: './screenshots',
  platform: 'web',
  verbose: false,
  caseRetries: 0,
  stateProvider: undefined,
  afterLaunch: undefined,
  baselineDir: './baselines',
  updateBaselines: false,
  mockServerUrl: undefined,
  mockToken: undefined,
  responsive: { medium: 768, regular: 1024 },
  screenReadyStrategy: 'auto',
  screenReadyTimeout: 15000,
  testsDir: undefined
};

/**
 * Injected into every document: records window.open calls so the `openedUrl`
 * assert can verify new-tab affordances without a real popup dependency.
 * Idempotent — safe to install via both addInitScript and evaluate.
 */
function installWindowOpenSpy(): void {
  const w = window as unknown as {
    __jsonuiOpenSpyInstalled?: boolean;
    __jsonuiOpenedUrls?: string[];
    open: typeof window.open;
  };
  if (w.__jsonuiOpenSpyInstalled) return;
  w.__jsonuiOpenSpyInstalled = true;
  w.__jsonuiOpenedUrls = [];
  const original = w.open.bind(window);
  w.open = ((url?: string | URL, target?: string, features?: string) => {
    w.__jsonuiOpenedUrls!.push(String(url ?? ''));
    try {
      return original(url as string, target, features);
    } catch {
      return null;
    }
  }) as typeof window.open;
}

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
  /**
   * Identity of the test file / case currently executing — embedded into
   * `screenshot` action filenames (parity with failure_<test>_<case> and the
   * iOS/Android drivers) so `jsonui-test artifacts pull` output is
   * self-describing.
   */
  private currentTestName = '';
  /**
   * The screen the previously executed inline step ran on; undefined means
   * "unknown", which forces the next inline step to be verified.
   */
  private trackedScreen: string | undefined;
  private currentCaseName = '';
  /**
   * The orientation the run asked for, after resolving file > run default;
   * a `setOrientation` step overwrites it for the cases that follow, which
   * is what makes it the DECLARED value rather than the configured one.
   * Undefined means nothing declared an orientation at all.
   */
  private declaredOrientation: ResponsiveOrientation | undefined;
  /**
   * The screen whose bridge `state` reads (spec §6): the screen under test;
   * in a flow the step's `screen`, else the last one named; inside a
   * referenced file, that file's screen.
   */
  private stateScreen: string | undefined;
  /** The harness's provider, else the bridge. */
  private stateProvider: StateProvider;
  /** Flow: screens whose initialState receipt is still to be checked -> launchId. */
  private pendingReceipts = new Map<string, string>();
  /** The open run's progress records (ProgressReporter); null between runs. */
  private progress: ProgressReporter | null = null;
  /** The open run's rows, counted as results.json counts them, for run_end. */
  private progressCounts = { passed: 0, failed: 0, skipped: 0 };
  /** The file being run, as its progress records name it. */
  private progressFile = '';
  /** The open run's suites with their progress `file`, for the default results file. */
  private runSuites: DefaultResultsSuite[] = [];
  /**
   * Writes each progress run's results to the default location
   * (DefaultResults.ts) — always, whether or not the consumer also calls
   * ResultsWriter.write. Replaced in tests.
   */
  private defaultResults = new DefaultResultsWriter();

  constructor(page: Page, config: TestRunnerConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      responsive: { ...DEFAULT_CONFIG.responsive, ...config.responsive }
    };
    this.page = page;
    this.actionExecutor = new ActionExecutor(page, this.config.defaultTimeout, this.variables);
    // Route `screenshot` action captures into screenshotDir with identity in
    // the name (previously they were written to the CWD, invisible to
    // `jsonui-test artifacts pull`).
    this.actionExecutor.screenshotHandler = async (name: string) => {
      await this.takeScreenshot(`screenshot_${this.currentTestName}_${this.currentCaseName}_${name}`);
    };
    this.stateProvider = this.config.stateProvider ?? new BridgeStateProvider(page, () => this.stateScreen);
    this.assertionExecutor = new AssertionExecutor(page, this.config.defaultTimeout, {
      stateProvider: this.stateProvider,
      baselineDir: this.config.baselineDir,
      updateBaselines: this.config.updateBaselines
    });
    this.mockClient = (this.config.mockServerUrl && this.config.mockToken)
      ? new MockClient(page.request, this.config.mockServerUrl, this.config.mockToken)
      : null;

    // Spy on window.open in every future document (openedUrl assert).
    void page.addInitScript(installWindowOpenSpy).catch(() => {});
  }

  /**
   * Make sure the CURRENT document has the window.open spy too — the runner
   * may be constructed after the app has already navigated, in which case
   * addInitScript alone would only cover the next navigation.
   */
  private async ensureWindowOpenSpy(): Promise<void> {
    await this.page.evaluate(installWindowOpenSpy).catch(() => {});
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
   * Open a run of `files` test files for the progress records: run_start
   * now, run_end at `endRun`. Only for a harness that runs several files
   * through this one runner — `run` outside an open run is a run of one file
   * by itself. Opening a run while one is open ends that one first.
   */
  beginRun(files: number): void {
    if (this.progress) this.endRun();
    this.progress = new ProgressReporter();
    this.progressCounts = { passed: 0, failed: 0, skipped: 0 };
    this.runSuites = [];
    this.progress.runStart(files, this.browserName());
  }

  /**
   * Close the run `beginRun` opened: run_end with the rows it produced, then
   * the run's one default-location results file (same run id, one suite per
   * file that returned, each with its progress `file`). A run in which no
   * file returned writes none. The write cannot throw.
   */
  endRun(): void {
    if (!this.progress) return;
    const { passed, failed, skipped } = this.progressCounts;
    this.progress.runEnd(passed, failed, skipped);
    const runId = this.progress.runId;
    const suites = this.runSuites;
    this.progress = null;
    this.runSuites = [];
    if (suites.length > 0) this.defaultResults.write(suites, runId);
  }

  /**
   * One file inside the open run, or inside a run of its own. Every row the
   * file returns is counted for run_end, teardown rows included, because
   * results.json counts them; a file that throws still ends its own run.
   */
  private async inRun(testPath: string, body: () => Promise<TestSuiteResult>): Promise<TestSuiteResult> {
    const ownRun = this.progress === null;
    if (ownRun) this.beginRun(1);
    const file = this.progressFileName(testPath);
    this.progressFile = file;
    try {
      const suite = await body();
      this.runSuites.push({ suite, file });
      for (const result of suite.results) {
        if (result.skipped) this.progressCounts.skipped++;
        else if (result.passed) this.progressCounts.passed++;
        else this.progressCounts.failed++;
      }
      return suite;
    } finally {
      if (ownRun) this.endRun();
    }
  }

  /** The test file relative to testsDir (default: the working directory), '/'-separated. */
  private progressFileName(testPath: string): string {
    if (!testPath) return PROGRESS_INLINE_FILE;
    const root = path.resolve(this.config.testsDir ?? process.cwd());
    return path.relative(root, path.resolve(testPath)).split(path.sep).join('/');
  }

  /** The browser's name for run_start, when the page can tell (a fake page cannot). */
  private browserName(): string | undefined {
    try {
      return this.page.context().browser()?.browserType().name();
    } catch {
      return undefined;
    }
  }

  /** case_start of one attempt; returns its start time for `caseEnded`. */
  private caseStarted(testName: string, caseName: string, attempt: number): number {
    this.progress?.caseStart(this.progressFile, testName, caseName, attempt);
    return Date.now();
  }

  /**
   * case_end of one attempt. Callers gate a case before its attempts, so an
   * attempt's row is passed or failed, never skipped.
   */
  private caseEnded(result: TestResult, attempt: number, started: number): void {
    this.progress?.caseEnd(
      this.progressFile, result.testName, result.caseName, attempt,
      result.passed ? 'passed' : 'failed', Date.now() - started
    );
  }

  /**
   * The records of a row decided without attempts: a skipped row is the one
   * attempt-0 case_end; a row failed before its body could run (launch,
   * setup, needs-reopen) or added for a failed teardown is one attempt that
   * failed — every results.json row has its case lines, so the last
   * case_end of each adds up to run_end. Returns the row.
   */
  private progressRow(result: TestResult): TestResult {
    if (result.skipped) {
      this.progress?.caseSkipped(this.progressFile, result.testName, result.caseName);
    } else {
      this.caseEnded(result, 1, this.caseStarted(result.testName, result.caseName, 1));
    }
    return result;
  }

  /**
   * Run a screen test
   */
  async runScreenTest(test: ScreenTest, testPath: string = ''): Promise<TestSuiteResult> {
    return this.inRun(testPath, () => this.runScreenTestFile(test));
  }

  private async runScreenTestFile(test: ScreenTest): Promise<TestSuiteResult> {
    const results: TestResult[] = [];
    const startTime = Date.now();

    await this.ensureWindowOpenSpy();

    // Check platform compatibility. Emit a skipped row per case (not results: [])
    // so file-level skips stay visible in the report — "no silent truncation".
    if (!platformIncludes(test.platform, this.config.platform)) {
      this.log('Skipping test - platform mismatch');
      return {
        suiteName: test.metadata.name,
        results: test.cases.map(testCase => this.progressRow({
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

    // Orientation is applied BEFORE the readiness gate and setup: a screen
    // that renders at one size and is then rotated has already made its
    // layout decisions, so a run that rotates afterwards is not the run the
    // file asked for.
    await this.applyRunOrientation(test.orientation);

    // Artifact identity for this file (setup/teardown captures carry the
    // phase name until runTestCase overwrites the case name).
    this.currentTestName = test.metadata.name;
    this.currentCaseName = 'setup';
    this.stateScreen = screenIdFromLayout(test.source?.layout) ?? undefined;

    if (test.caseIsolation === 'reopen') {
      await this.runCasesReopened(test, results);
    } else {
      await this.runCasesShared(test, results);
    }

    // The launch's sessionStorage keys belong to this file only.
    await this.clearFileStorage();

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
   * `caseIsolation: 'shared'` (the default): the file opens the screen once,
   * runs setup once, runs every case in that one page state, then teardown
   * once. A case inherits whatever the previous case left — its scroll
   * position, the page it navigated to — so the order of the cases matters.
   */
  private async runCasesShared(test: ScreenTest, results: TestResult[]): Promise<void> {
    // The launch (launch, initialState, mocks, one reload) and, after the
    // readiness gate, the receipt. A failure of either fails every case as
    // 'setup' — the body never ran — and teardown still runs. The readiness
    // gate itself still propagates: the file cannot run at all.
    let setupError: string | null = null;
    let screens: InitialStateScreens | null = null;
    let launchId: string | null | undefined;
    try {
      screens = screenTestScreens(test);
      launchId = await this.openScreen(test, screens, null);
    } catch (error) {
      setupError = `launch failed: ${error instanceof Error ? error.message : String(error)}`;
      this.log(setupError);
    }
    if (setupError === null) {
      this.log('Waiting for UI to be ready...');
      await this.waitForScreenReady(test);
      await this.page.waitForTimeout(500);
      try {
        await this.awaitReceipts(screens, launchId);
      } catch (error) {
        setupError = `launch failed: ${error instanceof Error ? error.message : String(error)}`;
        this.log(setupError);
      }
    }

    // Run setup. If setup throws, every case is recorded as failed but teardown still runs.
    if (setupError === null && test.setup) {
      this.log('Running setup...');
      try {
        await this.executeSteps(test.setup, []);
      } catch (error) {
        setupError = `setup failed: ${error instanceof Error ? error.message : String(error)}`;
        this.log(setupError);
      }
    }

    // Run test cases
    for (const testCase of test.cases) {
      if (setupError !== null) {
        results.push(this.progressRow({
          testName: test.metadata.name,
          caseName: testCase.name,
          passed: false,
          error: setupError,
          // The STAGE: the case's own fixture steps failed, so the body
          // never ran and this row says nothing about the app.
          failureReason: 'setup',
          durationMs: 0
        }));
        continue;
      }
      const gated = await this.gateCase(test.metadata.name, testCase);
      if (gated) {
        results.push(this.progressRow(gated));
        continue;
      }
      if (caseNeedsReopen(test, testCase)) {
        // The file's payload went with the one launch; this case's cannot.
        results.push(this.progressRow(await this.withOrientation({
          testName: test.metadata.name,
          caseName: testCase.name,
          passed: false,
          error: caseNeedsReopenMessage(testCase.name),
          failureReason: 'setup',
          durationMs: 0
        })));
        continue;
      }
      results.push(await this.runTestCaseWithRetries(test.metadata.name, testCase));
    }

    // Run teardown (guaranteed). A teardown failure is recorded as an extra failed result.
    if (test.teardown) {
      this.log('Running teardown...');
      this.currentCaseName = 'teardown';
      const message = await this.runTeardown(test.teardown);
      if (message !== null) {
        results.push(this.progressRow({
          testName: test.metadata.name,
          caseName: 'teardown',
          passed: false,
          error: message,
          // A teardown failure is a teardown failure whatever threw it.
          failureReason: 'teardown',
          durationMs: 0
        }));
      }
    }
  }

  /**
   * `caseIsolation: 'reopen'`: every case that runs starts from a freshly
   * opened screen. Before each case the page goes back to the URL it was on
   * when this file started (with the file's mock scenarios re-applied first),
   * the readiness gate runs, then setup; teardown runs after each case. A
   * case gated out (skip / platform / responsive) is recorded without opening
   * anything. Each retry attempt re-opens too, so a retry starts clean.
   *
   * Failure semantics follow the shared path, per case: a failed re-open or
   * setup fails that case with failureReason 'setup' (the body never ran),
   * teardown still runs after it, and the next case re-opens independently.
   * A teardown failure is recorded as an extra 'teardown' row naming the case.
   */
  private async runCasesReopened(test: ScreenTest, results: TestResult[]): Promise<void> {
    const initialUrl = this.page.url();
    const maxAttempts = Math.max(0, this.config.caseRetries ?? 0) + 1;

    for (const testCase of test.cases) {
      const gated = await this.gateCase(test.metadata.name, testCase);
      if (gated) {
        results.push(this.progressRow(gated));
        continue;
      }

      let attempts = 0;
      let result: TestResult;
      let teardownError: string | null;
      do {
        attempts++;
        if (attempts > 1) {
          this.log(`  Case ${testCase.name} failed — retry attempt ${attempts}/${maxAttempts}`);
        }
        const started = this.caseStarted(test.metadata.name, testCase.name, attempts);
        ({ result, teardownError } = await this.runReopenedAttempt(test, testCase, initialUrl));
        this.caseEnded(result, attempts, started);
      } while (!result.passed && attempts < maxAttempts);
      result.attempts = attempts;
      results.push(result);

      if (teardownError !== null) {
        results.push(this.progressRow({
          testName: test.metadata.name,
          caseName: 'teardown',
          passed: false,
          error: `after case '${testCase.name}': ${teardownError}`,
          failureReason: 'teardown',
          durationMs: 0
        }));
      }
    }
  }

  /** One reopen → setup → case → teardown pass for `runCasesReopened`. */
  private async runReopenedAttempt(
    test: ScreenTest,
    testCase: TestCase,
    initialUrl: string
  ): Promise<{ result: TestResult; teardownError: string | null }> {
    this.currentTestName = test.metadata.name;
    this.currentCaseName = 'setup';
    let result: TestResult;
    let stageError: string | null = null;
    try {
      await this.reopenScreen(test, testCase, initialUrl);
    } catch (error) {
      stageError = `reopen failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (stageError === null && test.setup) {
      this.log('Running setup...');
      try {
        await this.executeSteps(test.setup, []);
      } catch (error) {
        stageError = `setup failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    if (stageError !== null) {
      this.log(`Case ${testCase.name}: ${stageError}`);
      result = await this.withOrientation({
        testName: test.metadata.name,
        caseName: testCase.name,
        passed: false,
        error: stageError,
        failureReason: 'setup',
        durationMs: 0
      });
    } else {
      result = await this.runTestCase(test.metadata.name, testCase);
    }

    let teardownError: string | null = null;
    if (test.teardown) {
      this.log('Running teardown...');
      this.currentCaseName = 'teardown';
      teardownError = await this.runTeardown(test.teardown);
    }
    return { result, teardownError };
  }

  /**
   * Open the screen afresh for the next case: the whole launch sequence again
   * (launch, the file's initialState merged with the case's, the file's mock
   * scenarios — a case may have switched them), then `goto` the URL the file
   * started on, the readiness gate and the receipt.
   */
  private async reopenScreen(test: ScreenTest, testCase: TestCase, initialUrl: string): Promise<void> {
    if (!initialUrl || initialUrl === 'about:blank') {
      throw new Error(
        "caseIsolation 'reopen' re-opens the URL the page was on when the file started, " +
        `and the page was on '${initialUrl || '(none)'}'. Navigate to the screen before running the file.`
      );
    }
    this.log(`Re-opening ${initialUrl} for the next case...`);
    const screens = screenTestScreens(test, testCase);
    const launchId = await this.openScreen(test, screens, initialUrl);
    await this.waitForScreenReady(test);
    await this.page.waitForTimeout(500);
    await this.awaitReceipts(screens, launchId);
  }

  /**
   * Steps 1-6 of the launch sequence for a screen test (spec §10.2):
   * clearState, permissions, arguments, initialState, mocks, then open
   * exactly once — `reload` for the file (only when there is something to
   * launch with), `goto(reopenUrl)` on a reopen (always). Returns what
   * applyLaunchSequence returns.
   */
  private async openScreen(
    test: ScreenTest,
    screens: InitialStateScreens | null,
    reopenUrl: string | null
  ): Promise<string | null | undefined> {
    const launchId = await this.applyLaunchSequence(test, screens);
    if (reopenUrl !== null) {
      await this.page.goto(reopenUrl);
    } else if (launchId !== undefined) {
      this.log('Reloading with the launch applied...');
      await this.page.reload();
    }
    if (reopenUrl !== null || launchId !== undefined) {
      await this.ensureWindowOpenSpy();
    }
    return launchId;
  }

  /** Step 7: each screen the payload names confirms it (StateBridge.waitForReceipt). */
  private async awaitReceipts(
    screens: InitialStateScreens | null,
    launchId: string | null | undefined
  ): Promise<void> {
    if (!launchId || !screens) return;
    for (const screenId of Object.keys(screens)) {
      await waitForReceipt(this.page, screenId, launchId, this.config.screenReadyTimeout);
    }
  }

  /**
   * Steps 1-5 of the launch sequence. Returns undefined when the file has
   * nothing to launch with (no launch, mocks or payload: nothing is done and
   * nothing is reloaded), else the payload's launchId, or null when the
   * launch carries no payload.
   */
  private async applyLaunchSequence(
    test: ScreenTest | FlowTest,
    screens: InitialStateScreens | null
  ): Promise<string | null | undefined> {
    if (!launchNeeded(test, screens)) return undefined;
    await applyLaunchToPage(this.page, test.launch);
    if (this.config.afterLaunch) {
      this.log('Running afterLaunch...');
      await this.config.afterLaunch(this.page);
    }
    const payload = screens ? makePayload(screens) : null;
    await writeInitialState(this.page, payload);
    if (test.mocks) {
      this.log('Applying mock scenarios...');
      await this.requireMockClient('mocks').scenarioSet(test.mocks);
    }
    return payload ? payload.launchId : null;
  }

  /** End of a file: best effort, a closed or blank page has nothing to clear. */
  private async clearFileStorage(): Promise<void> {
    try {
      await clearTestStorage(this.page);
    } catch (error) {
      this.log(`Clearing test storage failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Run teardown steps; returns the failure message, or null when they passed. */
  private async runTeardown(steps: TestStep[]): Promise<string | null> {
    try {
      await this.executeSteps(steps, []);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Teardown failed: ${message}`);
      return message;
    }
  }

  /**
   * Run a flow test
   */
  async runFlowTest(test: FlowTest, testPath: string = ''): Promise<TestSuiteResult> {
    return this.inRun(testPath, () => this.runFlowTestFile(test));
  }

  private async runFlowTestFile(test: FlowTest): Promise<TestSuiteResult> {
    const startTime = Date.now();

    await this.ensureWindowOpenSpy();

    // Check platform compatibility. Emit a skipped row (not results: []) so the
    // flow-level skip stays visible in the report — "no silent truncation".
    if (!platformIncludes(test.platform, this.config.platform)) {
      this.log('Skipping flow test - platform mismatch');
      return {
        suiteName: test.metadata.name,
        results: [this.progressRow({
          testName: test.metadata.name,
          caseName: 'flow',
          passed: true,
          skipped: true,
          skipReason: 'platform',
          durationMs: 0
        })],
        totalDurationMs: 0
      };
    }

    const results: TestResult[] = [];
    const warnings: string[] = [];
    let flowError: string | null = null;

    // Same ordering argument as the screen path: rotate before anything
    // renders, not after.
    await this.applyRunOrientation(test.orientation);

    // A flow acts as a single case for artifact identity purposes.
    this.currentTestName = test.metadata.name;
    this.currentCaseName = 'flow';

    this.pendingReceipts = new Map();

    // The launch sequence (launch, initialState.viewModels, mocks, one
    // reload). The receipt of each screen is checked when the flow first
    // reaches it. A failure here fails the flow rather than running it
    // against a launch it did not ask for.
    try {
      const screens = flowScreens(test);
      const launchId = await this.applyLaunchSequence(test, screens);
      if (launchId !== undefined) {
        this.log('Reloading with the launch applied...');
        await this.page.reload();
        await this.ensureWindowOpenSpy();
      }
      if (launchId && screens) {
        for (const screenId of Object.keys(screens)) this.pendingReceipts.set(screenId, launchId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.clearFileStorage();
      return {
        suiteName: test.metadata.name,
        results: [this.progressRow({
          testName: test.metadata.name,
          caseName: 'flow',
          passed: false,
          error: `launch failed: ${message}`,
          failureReason: 'setup',
          durationMs: Date.now() - startTime
        })],
        totalDurationMs: Date.now() - startTime
      };
    }

    // The flow body (setup + steps) is the retry unit: flows begin with
    // their own launch/navigation steps, so a re-run starts clean. Teardown
    // still runs exactly once, after the final attempt. Warnings from a
    // failed non-final attempt are dropped (same rule as the `retry` step).
    const maxAttempts = Math.max(0, this.config.caseRetries ?? 0) + 1;
    let flowAttempts = 0;
    do {
      flowAttempts++;
      flowError = null;
      // The flow body is the flow's one case; referenced screen-test cases
      // run inside it and have no records of their own.
      const attemptStarted = this.caseStarted(test.metadata.name, 'flow', flowAttempts);
      const attemptWarnings: string[] = [];
      // Each attempt starts on no known screen: the first inline step is
      // verified (and its pending receipt checked) again, not skipped as
      // "same screen" because the failed attempt got as far as naming it;
      // and `state` reads nothing until a step names a screen. Also clears
      // what a previous file left.
      this.trackedScreen = undefined;
      this.stateScreen = undefined;
      try {
        // Run setup
        if (test.setup) {
          this.log('Running flow setup...');
          await this.executeFlowSteps(test.setup, attemptWarnings);
        }

        // Run flow steps
        this.log('Running flow steps...');
        await this.executeFlowSteps(test.steps, attemptWarnings);
      } catch (error) {
        flowError = error instanceof Error ? error.message : String(error);
        this.log(`Flow test failed: ${flowError}`);
      }
      this.progress?.caseEnd(
        this.progressFile, test.metadata.name, 'flow', flowAttempts,
        flowError === null ? 'passed' : 'failed', Date.now() - attemptStarted
      );
      if (flowError === null || flowAttempts >= maxAttempts) {
        warnings.push(...attemptWarnings);
        if (flowError === null) {
          for (const screenId of this.pendingReceipts.keys()) {
            warnings.push(
              `initialState for screen '${screenId}' was never checked: the flow never reached it ` +
              '(no step names that screen)'
            );
          }
        }
      } else {
        this.log(`  Flow failed — retry attempt ${flowAttempts + 1}/${maxAttempts}`);
      }
    } while (flowError !== null && flowAttempts < maxAttempts);

    results.push(await this.withOrientation({
      testName: test.metadata.name,
      caseName: 'flow',
      passed: flowError === null,
      error: flowError ?? undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      attempts: flowAttempts,
      durationMs: Date.now() - startTime
    }));

    // Run teardown (guaranteed)
    if (test.teardown) {
      this.log('Running flow teardown...');
      try {
        await this.executeFlowSteps(test.teardown, []);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`Flow teardown failed: ${message}`);
        results.push(this.progressRow({
          testName: test.metadata.name,
          caseName: 'teardown',
          passed: false,
          error: message,
          // A teardown failure is a teardown failure whatever threw it.
          failureReason: 'teardown',
          durationMs: 0
        }));
      }
    }

    await this.clearFileStorage();

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

  /**
   * Run a case, re-running it up to `caseRetries` extra times while it
   * fails. The returned result is the final attempt's, stamped with the
   * total attempt count (skipped rows never ran and carry none).
   */
  private async runTestCaseWithRetries(testName: string, testCase: TestCase): Promise<TestResult> {
    const maxAttempts = Math.max(0, this.config.caseRetries ?? 0) + 1;
    let attempts = 1;
    let started = this.caseStarted(testName, testCase.name, attempts);
    let result = await this.runTestCase(testName, testCase);
    this.caseEnded(result, attempts, started);
    while (!result.passed && !result.skipped && attempts < maxAttempts) {
      attempts++;
      this.log(`  Case ${testCase.name} failed — retry attempt ${attempts}/${maxAttempts}`);
      started = this.caseStarted(testName, testCase.name, attempts);
      result = await this.runTestCase(testName, testCase);
      this.caseEnded(result, attempts, started);
    }
    if (!result.skipped) {
      result.attempts = attempts;
    }
    return result;
  }

  /**
   * The static and viewport gates a case passes before anything runs: `skip`,
   * case-level platform, case-level responsive. Returns the skipped row, or
   * null when the case should run.
   */
  private async gateCase(testName: string, testCase: TestCase): Promise<TestResult | null> {
    // Check if skipped
    if (testCase.skip) {
      this.log(`Skipping case: ${testCase.name}`);
      return this.withOrientation({
        testName,
        caseName: testCase.name,
        passed: true,
        skipped: true,
        durationMs: 0
      });
    }

    // Check platform compatibility. Deterministic skip-reason rule: platform is
    // evaluated BEFORE responsive, so when a case carries both gates and both
    // are unmet, `skipReason` is 'platform' (the static gate wins over the
    // viewport-dependent one, keeping reports stable across viewport sizes).
    if (!platformIncludes(testCase.platform, this.config.platform)) {
      this.log(`Skipping case ${testCase.name} - platform mismatch`);
      return this.withOrientation({
        testName,
        caseName: testCase.name,
        passed: true,
        skipped: true,
        skipReason: 'platform',
        durationMs: 0
      });
    }

    // Check responsive compatibility (case-level gate, parallel to platform)
    if (testCase.responsive !== undefined && !(await this.currentSizeMatches(testCase.responsive))) {
      this.log(`Skipping case ${testCase.name} - responsive mismatch`);
      return this.withOrientation({
        testName,
        caseName: testCase.name,
        passed: true,
        skipped: true,
        skipReason: 'responsive',
        durationMs: 0
      });
    }

    return null;
  }

  private async runTestCase(testName: string, testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    this.currentTestName = testName;
    this.currentCaseName = testCase.name;

    const gated = await this.gateCase(testName, testCase);
    if (gated) return gated;

    this.log(`Running case: ${testCase.name}`);

    // Apply load-time args substitution if test case has args
    const processedCase = TestLoader.applyArgsSubstitution(testCase);
    const warnings: string[] = [];

    try {
      await this.executeSteps(processedCase.steps, warnings);
      return this.withOrientation({
        testName,
        caseName: testCase.name,
        passed: true,
        warnings: warnings.length > 0 ? warnings : undefined,
        durationMs: Date.now() - startTime
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Case ${testCase.name} failed: ${errorMessage}`);

      if (this.config.screenshotOnFailure) {
        await this.takeScreenshot(`failure_${testName}_${testCase.name}`);
      }

      return this.withOrientation({
        testName,
        caseName: testCase.name,
        passed: false,
        error: errorMessage,
        failureReason: classifyFailure(error),
        warnings: warnings.length > 0 ? warnings : undefined,
        durationMs: Date.now() - startTime
      });
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
      // A `setOrientation` step is the top of the precedence chain, so what
      // the run DECLARES changes here. Recorded from the step rather than by
      // re-measuring: this half of the pair is the request, and measuring it
      // would collapse it onto the observed half.
      if (step.action === 'setOrientation' && step.orientation) {
        this.declaredOrientation = step.orientation;
      }
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
    if (condition.hidden !== undefined) {
      if (!(await isHidden(this.page.locator(`#${condition.hidden}`)))) {
        return false;
      }
    }
    if (condition.state !== undefined) {
      const found = await lookupState(this.stateProvider, condition.state.path);
      if (found.outcome === 'truncated') {
        throw new Error(TRUNCATED_MESSAGE(condition.state.path, found.bytes));
      }
      // Pending / unresolved is "not met" — a condition does not wait.
      if (found.outcome !== 'value' || !deepEquals(found.value, condition.state.equals)) {
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
  /**
   * Resolve and apply the orientation this run starts in, once.
   *
   * Order: the file's own `orientation`, else the run default for the tier
   * this viewport falls in. A `setOrientation` step later in the run beats
   * both, which is why this only runs at the start.
   *
   * The tier is resolved from the LIVE viewport rather than from anything
   * installed, because the whole reason the default is a table is that one
   * bundle runs on several form factors.
   */
  private async applyRunOrientation(declared: ResponsiveOrientation | undefined): Promise<void> {
    const size = await resolveViewportSize(this.page);
    const tier = resolveSizeTier(size.width, this.config.responsive);
    const wanted = declared ?? defaultOrientationForTier(this.config.runDefaults ?? null, tier);
    this.declaredOrientation = wanted;
    if (!wanted) {
      return;
    }
    if (deriveOrientation(size) === wanted) {
      return;
    }
    const viewport = this.page.viewportSize();
    if (!viewport) {
      // A viewport: null context sizes itself to the window; there is no
      // viewport to swap. Say so rather than silently recording a declared
      // orientation the run never applied — `observedOrientation` will
      // disagree, and this line is what explains the disagreement.
      this.log(
        `[orientation] declared '${wanted}' but no viewport is set ` +
        '(viewport: null context) - not applied'
      );
      return;
    }
    this.log(`[orientation] applying run orientation '${wanted}'`);
    await this.page.setViewportSize({ width: viewport.height, height: viewport.width });
  }

  /**
   * The orientation the page is in RIGHT NOW, asked of the viewport.
   *
   * Deliberately not derived from `declaredOrientation`: the pair exists to
   * record a disagreement, and a derived value can never disagree.
   */
  private async observeOrientation(): Promise<ResponsiveOrientation | undefined> {
    try {
      return deriveOrientation(await resolveViewportSize(this.page));
    } catch {
      // A closed page cannot be measured. Absent reads as "not reported",
      // which is true, rather than as an orientation nobody observed.
      return undefined;
    }
  }

  /**
   * Stamp a result that actually RAN with the orientation pair.
   *
   * Skipped rows are not stamped, for the same reason they carry no
   * `attempts`: a case that never executed has no orientation it ran in, and
   * a viewport reading taken at skip time would look like one.
   *
   * EVERY result goes through here, skipped ones included, so that this
   * guard is what makes that true. Routing the skipped returns around it
   * left the guard unreachable: the arms named for it stayed green with the
   * guard deleted, which is a test asserting an outcome the code it names
   * does not produce. Measured with a mutation, not reasoned about.
   */
  private async withOrientation(result: TestResult): Promise<TestResult> {
    if (result.skipped) {
      return result;
    }
    const observed = await this.observeOrientation();
    return {
      ...result,
      declaredOrientation: this.declaredOrientation,
      observedOrientation: observed
    };
  }

  private async currentSizeMatches(condition: ResponsiveCondition): Promise<boolean> {
    const size = await resolveViewportSize(this.page);
    return matchesResponsive(condition, size, this.config.responsive);
  }

  /** Instant visibility check (no polling) used by `when` conditions — the
   * same predicate as the `visible` assert (src/visibility.ts). */
  private async isInstantlyVisible(id: string): Promise<boolean> {
    return isInViewport(this.page.locator(`#${id}`));
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

  /**
   * Implicit screen verification (canon: implicitVerification). Runs BEFORE
   * the step, because the step is meant to run ON that screen.
   */
  private async verifyScreenTransitionIfNeeded(step: FlowTestStep): Promise<void> {
    const screen = step.screen;
    if (!screen) return;
    // Same screen as the last executed step: nothing has changed.
    if (screen === this.trackedScreen) return;

    if (this.config.verifyScreenTransitions) {
      await this.assertionExecutor.execute({
        assert: 'screen',
        name: screen,
        timeout: this.config.screenTransitionTimeout,
      } as TestStep);
    }
    this.trackedScreen = screen;
    await this.checkReceiptOnArrival(screen);
  }

  /**
   * Flow: the first time the flow reaches a screen its initialState names,
   * the screen must have confirmed it (same judgement as a screen test).
   */
  private async checkReceiptOnArrival(screen: string): Promise<void> {
    const launchId = this.pendingReceipts.get(screen);
    if (launchId === undefined) return;
    await waitForReceipt(this.page, screen, launchId, this.config.screenReadyTimeout);
    // Only once it passed: a retried flow body checks it again.
    this.pendingReceipts.delete(screen);
  }

  private async executeFlowStep(step: FlowTestStep, warnings: string[]): Promise<void> {
    // Evaluate step-level `when` for file/block/inline steps
    if (step.when && !(await this.evaluateCondition(step.when))) {
      this.log(`    Skipped flow step (when not satisfied)`);
      return;
    }

    // Handle file reference steps
    if (isFileReference(step)) {
      // A file reference carries no screen of its own, and the case it runs
      // may end anywhere — reset to unknown so the next inline step is
      // verified rather than trusted.
      this.trackedScreen = undefined;
      await this.executeFileReferenceStep(step, warnings);
      return;
    }

    // Handle block steps (grouped inline actions)
    if (isBlockStep(step)) {
      await this.executeBlockStep(step, warnings);
      return;
    }

    // Handle inline steps - convert FlowTestStep to TestStep and execute
    if (step.screen) this.stateScreen = step.screen;
    await this.verifyScreenTransitionIfNeeded(step);
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
    const referenced = TestLoader.resolveFileReference(step.file as string);
    const testCases = TestLoader.resolveFileReferenceCases(step);
    for (const w of referencedInitialStateWarnings(step, referenced)) {
      warnings.push(referencedInitialStateMessage(w));
    }
    // A referenced case reads state from its own file's screen.
    const outerStateScreen = this.stateScreen;
    this.stateScreen = screenIdFromLayout(referenced.source?.layout) ?? outerStateScreen;
    try {
      await this.runReferencedCases(testCases, warnings);
    } finally {
      this.stateScreen = outerStateScreen;
    }
  }

  private async runReferencedCases(testCases: TestCase[], warnings: string[]): Promise<void> {
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
      hookArgs: step.hookArgs,
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

  /**
   * Unconditional counterpart to `log`. Used only where staying quiet is the
   * defect: a run that silently waits on the network gate looks exactly like
   * a run that waited on the marker, right up to the 30s timeout that
   * follows.
   */
  private notice(message: string): void {
    console.warn(`[JsonUITestRunner] ${message}`);
  }

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
  private async waitForScreenReady(test: ScreenTest): Promise<void> {
    // A test's own declaration outranks the project-wide strategy: it is the
    // more specific statement, and it exists precisely for the files whose
    // answer differs from the project's.
    const declared = test.screenReady;
    if (declared === 'none') {
      this.notice(
        "screen ready: no gate (this test declares screenReady: 'none'). " +
        'Nothing is awaited before setup — the test does its own waiting.'
      );
      return;
    }
    if (typeof declared === 'object' && declared !== null) {
      this.notice(
        `screen ready: marker gate for '${declared.marker}' (declared by ` +
        'this test, in place of the id derived from source.layout).'
      );
      await this.awaitMarker(declared.marker);
      return;
    }

    const screenId = screenIdFromLayout(test.source?.layout);
    const strategy = declared ?? this.config.screenReadyStrategy;

    if (strategy === 'networkidle') {
      this.notice(
        "screen ready: 'networkidle' gate (forced by " +
        `${declared ? 'this test' : 'screenReadyStrategy'}). ` +
        'A single hung request holds this open until the test times out.'
      );
      await this.page.waitForLoadState('networkidle');
      return;
    }

    if (!screenId) {
      const where = test.source?.layout ? `'${test.source.layout}'` : '(absent)';
      if (strategy === 'marker') {
        throw new Error(
          `screen ready: 'marker' gate was forced but no screen id could be derived ` +
          `from source.layout ${where}. Point source.layout at the screen's layout ` +
          `file, or set screenReadyStrategy: 'networkidle'.`
        );
      }
      // Announced, not silent. This is the gate that hangs, and a run that
      // fell back into it without saying so is indistinguishable from one
      // that used the marker — until both fail the same way.
      this.notice(
        `screen ready: no screen id could be derived from source.layout ${where}, ` +
        "so this screen falls back to the 'networkidle' gate. A single hung " +
        'request holds it open until the test times out.'
      );
      await this.page.waitForLoadState('networkidle');
      return;
    }

    if (strategy === 'marker') {
      this.notice(`screen ready: marker gate for '${screenId}' (forced by ` +
        `${declared ? 'this test' : 'screenReadyStrategy'}).`);
    } else {
      this.log(`Waiting for the '${screenId}' screen marker...`);
    }
    await this.awaitMarker(screenId);
  }

  /** Wait for one screen marker, or fail with the gate's own context added. */
  private async awaitMarker(screenId: string): Promise<void> {
    try {
      await this.assertionExecutor.waitForScreenMarker(
        screenId, this.config.screenReadyTimeout
      );
    } catch (error) {
      // The diagnosis already separates production build / stale generated
      // code / navigated elsewhere. Only the gate's own context is added —
      // which wait this was, and the ways out. The per-test ones come first:
      // a screen that is *supposed* to be absent is the case the project-wide
      // switch answers by giving up the gate everywhere.
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `screen not ready: ${detail}\n` +
        `(readiness gate waited ${this.config.screenReadyTimeout}ms for the ` +
        `'${screenId}' marker. If this test expects the screen NOT to render — ` +
        'a permission refusal in its place, a redirect elsewhere — declare ' +
        "screenReady: 'none', or screenReady: { marker: '<other-screen>' } to " +
        'wait for where it lands instead. A project whose screens are all ' +
        "hand-written can set screenReadyStrategy: 'networkidle'.)"
      );
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

  /** See TestRunnerConfig.testsDir. */
  testsDir(dir: string): this {
    this.config.testsDir = dir;
    return this;
  }

  /** See TestRunnerConfig.afterLaunch. */
  afterLaunch(hook: (page: Page) => void | Promise<void>): this {
    this.config.afterLaunch = hook;
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
