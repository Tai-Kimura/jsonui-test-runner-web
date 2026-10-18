/**
 * JsonUI Test Runner - Web Driver
 * Main test runner using Playwright
 */
import { Page } from 'playwright';
import { LoadedTest, ScreenTest, FlowTest, TestSuiteResult, ResponsiveThresholds, RunDefaults } from '../models/types';
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
    /**
     * The orientation the run asked for, after resolving file > run default;
     * a `setOrientation` step overwrites it for the cases that follow, which
     * is what makes it the DECLARED value rather than the configured one.
     * Undefined means nothing declared an orientation at all.
     */
    private declaredOrientation;
    /**
     * The screen whose bridge `state` reads (spec §6): the screen under test;
     * in a flow the step's `screen`, else the last one named; inside a
     * referenced file, that file's screen.
     */
    private stateScreen;
    /** The harness's provider, else the bridge. */
    private stateProvider;
    /** Flow: screens whose initialState receipt is still to be checked -> launchId. */
    private pendingReceipts;
    /** The open run's progress records (ProgressReporter); null between runs. */
    private progress;
    /** The open run's rows, counted as results.json counts them, for run_end. */
    private progressCounts;
    /** The file being run, as its progress records name it. */
    private progressFile;
    /** The open run's suites with their progress `file`, for the default results file. */
    private runSuites;
    /**
     * Writes each progress run's results to the default location
     * (DefaultResults.ts) — always, whether or not the consumer also calls
     * ResultsWriter.write. Replaced in tests.
     */
    private defaultResults;
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
     * Open a run of `files` test files for the progress records: run_start
     * now, run_end at `endRun`. Only for a harness that runs several files
     * through this one runner — `run` outside an open run is a run of one file
     * by itself. Opening a run while one is open ends that one first.
     */
    beginRun(files: number): void;
    /**
     * Close the run `beginRun` opened: run_end with the rows it produced, then
     * the run's one default-location results file (same run id, one suite per
     * file that returned, each with its progress `file`). A run in which no
     * file returned writes none. The write cannot throw.
     */
    endRun(): void;
    /**
     * One file inside the open run, or inside a run of its own. Every row the
     * file returns is counted for run_end, teardown rows included, because
     * results.json counts them; a file that throws still ends its own run.
     */
    private inRun;
    /** The test file relative to testsDir (default: the working directory), '/'-separated. */
    private progressFileName;
    /** The browser's name for run_start, when the page can tell (a fake page cannot). */
    private browserName;
    /** case_start of one attempt; returns its start time for `caseEnded`. */
    private caseStarted;
    /**
     * case_end of one attempt. Callers gate a case before its attempts, so an
     * attempt's row is passed or failed, never skipped.
     */
    private caseEnded;
    /**
     * The records of a row decided without attempts: a skipped row is the one
     * attempt-0 case_end; a row failed before its body could run (launch,
     * setup, needs-reopen) or added for a failed teardown is one attempt that
     * failed — every results.json row has its case lines, so the last
     * case_end of each adds up to run_end. Returns the row.
     */
    private progressRow;
    /**
     * Run a screen test
     */
    runScreenTest(test: ScreenTest, testPath?: string): Promise<TestSuiteResult>;
    private runScreenTestFile;
    /**
     * `caseIsolation: 'shared'` (the default): the file opens the screen once,
     * runs setup once, runs every case in that one page state, then teardown
     * once. A case inherits whatever the previous case left — its scroll
     * position, the page it navigated to — so the order of the cases matters.
     */
    private runCasesShared;
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
    private runCasesReopened;
    /** One reopen → setup → case → teardown pass for `runCasesReopened`. */
    private runReopenedAttempt;
    /**
     * Open the screen afresh for the next case: the whole launch sequence again
     * (launch, the file's initialState merged with the case's, the file's mock
     * scenarios — a case may have switched them), then `goto` the URL the file
     * started on, the readiness gate and the receipt.
     */
    private reopenScreen;
    /**
     * Steps 1-6 of the launch sequence for a screen test (spec §10.2):
     * clearState, permissions, arguments, initialState, mocks, then open
     * exactly once — `reload` for the file (only when there is something to
     * launch with), `goto(reopenUrl)` on a reopen (always). Returns what
     * applyLaunchSequence returns.
     */
    private openScreen;
    /** Step 7: each screen the payload names confirms it (StateBridge.waitForReceipt). */
    private awaitReceipts;
    /**
     * Steps 1-5 of the launch sequence. Returns undefined when the file has
     * nothing to launch with (no launch, mocks or payload: nothing is done and
     * nothing is reloaded), else the payload's launchId, or null when the
     * launch carries no payload.
     */
    private applyLaunchSequence;
    /** End of a file: best effort, a closed or blank page has nothing to clear. */
    private clearFileStorage;
    /** Run teardown steps; returns the failure message, or null when they passed. */
    private runTeardown;
    /**
     * Run a flow test
     */
    runFlowTest(test: FlowTest, testPath?: string): Promise<TestSuiteResult>;
    private runFlowTestFile;
    /**
     * Run a case, re-running it up to `caseRetries` extra times while it
     * fails. The returned result is the final attempt's, stamped with the
     * total attempt count (skipped rows never ran and carry none).
     */
    private runTestCaseWithRetries;
    /**
     * The static and viewport gates a case passes before anything runs: `skip`,
     * case-level platform, case-level responsive. Returns the skipped row, or
     * null when the case should run.
     */
    private gateCase;
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
    private applyRunOrientation;
    /**
     * The orientation the page is in RIGHT NOW, asked of the viewport.
     *
     * Deliberately not derived from `declaredOrientation`: the pair exists to
     * record a disagreement, and a derived value can never disagree.
     */
    private observeOrientation;
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
    private withOrientation;
    private currentSizeMatches;
    /** Instant visibility check (no polling) used by `when` conditions — the
     * same predicate as the `visible` assert (src/visibility.ts). */
    private isInstantlyVisible;
    private executeFlowSteps;
    /**
     * Implicit screen verification (canon: implicitVerification). Runs BEFORE
     * the step, because the step is meant to run ON that screen.
     */
    private verifyScreenTransitionIfNeeded;
    /**
     * Flow: the first time the flow reaches a screen its initialState names,
     * the screen must have confirmed it (same judgement as a screen test).
     */
    private checkReceiptOnArrival;
    private executeFlowStep;
    private executeBlockStep;
    private executeFileReferenceStep;
    private runReferencedCases;
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
    /** See TestRunnerConfig.testsDir. */
    testsDir(dir: string): this;
    /** See TestRunnerConfig.afterLaunch. */
    afterLaunch(hook: (page: Page) => void | Promise<void>): this;
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