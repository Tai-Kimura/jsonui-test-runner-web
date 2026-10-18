"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * Main test runner using Playwright
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestRunnerBuilder = exports.JsonUITestRunner = void 0;
const path = __importStar(require("path"));
const ActionExecutor_1 = require("../actions/ActionExecutor");
const AssertionExecutor_1 = require("../assertions/AssertionExecutor");
const visibility_1 = require("../visibility");
const types_1 = require("../models/types");
const failureReason_1 = require("./failureReason");
const TestLoader_1 = require("./TestLoader");
const StateProvider_1 = require("./StateProvider");
const MockClient_1 = require("./MockClient");
const LaunchConfig_1 = require("./LaunchConfig");
const InitialState_1 = require("./InitialState");
const StateBridge_1 = require("./StateBridge");
const screenIdentity_1 = require("./screenIdentity");
const RunDefaults_1 = require("./RunDefaults");
const ProgressReporter_1 = require("./ProgressReporter");
const DefaultResults_1 = require("./DefaultResults");
/** Safety cap for `repeat` with a `while` condition and no `times` */
const REPEAT_WHILE_CAP = 100;
const DEFAULT_CONFIG = {
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
function installWindowOpenSpy() {
    const w = window;
    if (w.__jsonuiOpenSpyInstalled)
        return;
    w.__jsonuiOpenSpyInstalled = true;
    w.__jsonuiOpenedUrls = [];
    const original = w.open.bind(window);
    w.open = ((url, target, features) => {
        w.__jsonuiOpenedUrls.push(String(url ?? ''));
        try {
            return original(url, target, features);
        }
        catch {
            return null;
        }
    });
}
/**
 * Main test runner for JsonUI tests
 */
class JsonUITestRunner {
    constructor(page, config = {}) {
        /** Runtime variables written by readText, shared with the action executor */
        this.variables = {};
        /**
         * Identity of the test file / case currently executing — embedded into
         * `screenshot` action filenames (parity with failure_<test>_<case> and the
         * iOS/Android drivers) so `jsonui-test artifacts pull` output is
         * self-describing.
         */
        this.currentTestName = '';
        this.currentCaseName = '';
        /** Flow: screens whose initialState receipt is still to be checked -> launchId. */
        this.pendingReceipts = new Map();
        /** The open run's progress records (ProgressReporter); null between runs. */
        this.progress = null;
        /** The open run's rows, counted as results.json counts them, for run_end. */
        this.progressCounts = { passed: 0, failed: 0, skipped: 0 };
        /** The file being run, as its progress records name it. */
        this.progressFile = '';
        /** The open run's suites with their progress `file`, for the default results file. */
        this.runSuites = [];
        /**
         * Writes each progress run's results to the default location
         * (DefaultResults.ts) — always, whether or not the consumer also calls
         * ResultsWriter.write. Replaced in tests.
         */
        this.defaultResults = new DefaultResults_1.DefaultResultsWriter();
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
            responsive: { ...DEFAULT_CONFIG.responsive, ...config.responsive }
        };
        this.page = page;
        this.actionExecutor = new ActionExecutor_1.ActionExecutor(page, this.config.defaultTimeout, this.variables);
        // Route `screenshot` action captures into screenshotDir with identity in
        // the name (previously they were written to the CWD, invisible to
        // `jsonui-test artifacts pull`).
        this.actionExecutor.screenshotHandler = async (name) => {
            await this.takeScreenshot(`screenshot_${this.currentTestName}_${this.currentCaseName}_${name}`);
        };
        this.stateProvider = this.config.stateProvider ?? new StateProvider_1.BridgeStateProvider(page, () => this.stateScreen);
        this.assertionExecutor = new AssertionExecutor_1.AssertionExecutor(page, this.config.defaultTimeout, {
            stateProvider: this.stateProvider,
            baselineDir: this.config.baselineDir,
            updateBaselines: this.config.updateBaselines
        });
        this.mockClient = (this.config.mockServerUrl && this.config.mockToken)
            ? new MockClient_1.MockClient(page.request, this.config.mockServerUrl, this.config.mockToken)
            : null;
        // Spy on window.open in every future document (openedUrl assert).
        void page.addInitScript(installWindowOpenSpy).catch(() => { });
    }
    /**
     * Make sure the CURRENT document has the window.open spy too — the runner
     * may be constructed after the app has already navigated, in which case
     * addInitScript alone would only cover the next navigation.
     */
    async ensureWindowOpenSpy() {
        await this.page.evaluate(installWindowOpenSpy).catch(() => { });
    }
    /** Return the configured mock client or throw a clear setup error. */
    requireMockClient(feature) {
        if (!this.mockClient) {
            throw new Error(`'${feature}' requires a mock server: set mockServerUrl + mockToken in the runner config ` +
                `(from 'jsonui-test mock serve').`);
        }
        return this.mockClient;
    }
    /**
     * Run a loaded test
     */
    async run(test) {
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
    beginRun(files) {
        if (this.progress)
            this.endRun();
        this.progress = new ProgressReporter_1.ProgressReporter();
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
    endRun() {
        if (!this.progress)
            return;
        const { passed, failed, skipped } = this.progressCounts;
        this.progress.runEnd(passed, failed, skipped);
        const runId = this.progress.runId;
        const suites = this.runSuites;
        this.progress = null;
        this.runSuites = [];
        if (suites.length > 0)
            this.defaultResults.write(suites, runId);
    }
    /**
     * One file inside the open run, or inside a run of its own. Every row the
     * file returns is counted for run_end, teardown rows included, because
     * results.json counts them; a file that throws still ends its own run.
     */
    async inRun(testPath, body) {
        const ownRun = this.progress === null;
        if (ownRun)
            this.beginRun(1);
        const file = this.progressFileName(testPath);
        this.progressFile = file;
        try {
            const suite = await body();
            this.runSuites.push({ suite, file });
            for (const result of suite.results) {
                if (result.skipped)
                    this.progressCounts.skipped++;
                else if (result.passed)
                    this.progressCounts.passed++;
                else
                    this.progressCounts.failed++;
            }
            return suite;
        }
        finally {
            if (ownRun)
                this.endRun();
        }
    }
    /** The test file relative to testsDir (default: the working directory), '/'-separated. */
    progressFileName(testPath) {
        if (!testPath)
            return ProgressReporter_1.PROGRESS_INLINE_FILE;
        const root = path.resolve(this.config.testsDir ?? process.cwd());
        return path.relative(root, path.resolve(testPath)).split(path.sep).join('/');
    }
    /** The browser's name for run_start, when the page can tell (a fake page cannot). */
    browserName() {
        try {
            return this.page.context().browser()?.browserType().name();
        }
        catch {
            return undefined;
        }
    }
    /** case_start of one attempt; returns its start time for `caseEnded`. */
    caseStarted(testName, caseName, attempt) {
        this.progress?.caseStart(this.progressFile, testName, caseName, attempt);
        return Date.now();
    }
    /**
     * case_end of one attempt. Callers gate a case before its attempts, so an
     * attempt's row is passed or failed, never skipped.
     */
    caseEnded(result, attempt, started) {
        this.progress?.caseEnd(this.progressFile, result.testName, result.caseName, attempt, result.passed ? 'passed' : 'failed', Date.now() - started);
    }
    /**
     * The records of a row decided without attempts: a skipped row is the one
     * attempt-0 case_end; a row failed before its body could run (launch,
     * setup, needs-reopen) or added for a failed teardown is one attempt that
     * failed — every results.json row has its case lines, so the last
     * case_end of each adds up to run_end. Returns the row.
     */
    progressRow(result) {
        if (result.skipped) {
            this.progress?.caseSkipped(this.progressFile, result.testName, result.caseName);
        }
        else {
            this.caseEnded(result, 1, this.caseStarted(result.testName, result.caseName, 1));
        }
        return result;
    }
    /**
     * Run a screen test
     */
    async runScreenTest(test, testPath = '') {
        return this.inRun(testPath, () => this.runScreenTestFile(test));
    }
    async runScreenTestFile(test) {
        const results = [];
        const startTime = Date.now();
        await this.ensureWindowOpenSpy();
        // Check platform compatibility. Emit a skipped row per case (not results: [])
        // so file-level skips stay visible in the report — "no silent truncation".
        if (!(0, types_1.platformIncludes)(test.platform, this.config.platform)) {
            this.log('Skipping test - platform mismatch');
            return {
                suiteName: test.metadata.name,
                results: test.cases.map(testCase => this.progressRow({
                    testName: test.metadata.name,
                    caseName: testCase.name,
                    passed: true,
                    skipped: true,
                    skipReason: 'platform',
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
        this.stateScreen = (0, screenIdentity_1.screenIdFromLayout)(test.source?.layout) ?? undefined;
        if (test.caseIsolation === 'reopen') {
            await this.runCasesReopened(test, results);
        }
        else {
            await this.runCasesShared(test, results);
        }
        // The launch's sessionStorage keys belong to this file only.
        await this.clearFileStorage();
        // Reset mock scenarios so state does not leak into the next test file.
        if (test.mocks && this.mockClient) {
            try {
                await this.mockClient.reset();
            }
            catch (error) {
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
    async runCasesShared(test, results) {
        // The launch (launch, initialState, mocks, one reload) and, after the
        // readiness gate, the receipt. A failure of either fails every case as
        // 'setup' — the body never ran — and teardown still runs. The readiness
        // gate itself still propagates: the file cannot run at all.
        let setupError = null;
        let screens = null;
        let launchId;
        try {
            screens = (0, InitialState_1.screenTestScreens)(test);
            launchId = await this.openScreen(test, screens, null);
        }
        catch (error) {
            setupError = `launch failed: ${error instanceof Error ? error.message : String(error)}`;
            this.log(setupError);
        }
        if (setupError === null) {
            this.log('Waiting for UI to be ready...');
            await this.waitForScreenReady(test);
            await this.page.waitForTimeout(500);
            try {
                await this.awaitReceipts(screens, launchId);
            }
            catch (error) {
                setupError = `launch failed: ${error instanceof Error ? error.message : String(error)}`;
                this.log(setupError);
            }
        }
        // Run setup. If setup throws, every case is recorded as failed but teardown still runs.
        if (setupError === null && test.setup) {
            this.log('Running setup...');
            try {
                await this.executeSteps(test.setup, []);
            }
            catch (error) {
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
            if ((0, InitialState_1.caseNeedsReopen)(test, testCase)) {
                // The file's payload went with the one launch; this case's cannot.
                results.push(this.progressRow(await this.withOrientation({
                    testName: test.metadata.name,
                    caseName: testCase.name,
                    passed: false,
                    error: (0, InitialState_1.caseNeedsReopenMessage)(testCase.name),
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
    async runCasesReopened(test, results) {
        const initialUrl = this.page.url();
        const maxAttempts = Math.max(0, this.config.caseRetries ?? 0) + 1;
        for (const testCase of test.cases) {
            const gated = await this.gateCase(test.metadata.name, testCase);
            if (gated) {
                results.push(this.progressRow(gated));
                continue;
            }
            let attempts = 0;
            let result;
            let teardownError;
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
    async runReopenedAttempt(test, testCase, initialUrl) {
        this.currentTestName = test.metadata.name;
        this.currentCaseName = 'setup';
        let result;
        let stageError = null;
        try {
            await this.reopenScreen(test, testCase, initialUrl);
        }
        catch (error) {
            stageError = `reopen failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        if (stageError === null && test.setup) {
            this.log('Running setup...');
            try {
                await this.executeSteps(test.setup, []);
            }
            catch (error) {
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
        }
        else {
            result = await this.runTestCase(test.metadata.name, testCase);
        }
        let teardownError = null;
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
    async reopenScreen(test, testCase, initialUrl) {
        if (!initialUrl || initialUrl === 'about:blank') {
            throw new Error("caseIsolation 'reopen' re-opens the URL the page was on when the file started, " +
                `and the page was on '${initialUrl || '(none)'}'. Navigate to the screen before running the file.`);
        }
        this.log(`Re-opening ${initialUrl} for the next case...`);
        const screens = (0, InitialState_1.screenTestScreens)(test, testCase);
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
    async openScreen(test, screens, reopenUrl) {
        const launchId = await this.applyLaunchSequence(test, screens);
        if (reopenUrl !== null) {
            await this.page.goto(reopenUrl);
        }
        else if (launchId !== undefined) {
            this.log('Reloading with the launch applied...');
            await this.page.reload();
        }
        if (reopenUrl !== null || launchId !== undefined) {
            await this.ensureWindowOpenSpy();
        }
        return launchId;
    }
    /** Step 7: each screen the payload names confirms it (StateBridge.waitForReceipt). */
    async awaitReceipts(screens, launchId) {
        if (!launchId || !screens)
            return;
        for (const screenId of Object.keys(screens)) {
            await (0, StateBridge_1.waitForReceipt)(this.page, screenId, launchId, this.config.screenReadyTimeout);
        }
    }
    /**
     * Steps 1-5 of the launch sequence. Returns undefined when the file has
     * nothing to launch with (no launch, mocks or payload: nothing is done and
     * nothing is reloaded), else the payload's launchId, or null when the
     * launch carries no payload.
     */
    async applyLaunchSequence(test, screens) {
        if (!(0, InitialState_1.launchNeeded)(test, screens))
            return undefined;
        await (0, LaunchConfig_1.applyLaunchToPage)(this.page, test.launch);
        if (this.config.afterLaunch) {
            this.log('Running afterLaunch...');
            await this.config.afterLaunch(this.page);
        }
        const payload = screens ? (0, InitialState_1.makePayload)(screens) : null;
        await (0, InitialState_1.writeInitialState)(this.page, payload);
        if (test.mocks) {
            this.log('Applying mock scenarios...');
            await this.requireMockClient('mocks').scenarioSet(test.mocks);
        }
        return payload ? payload.launchId : null;
    }
    /** End of a file: best effort, a closed or blank page has nothing to clear. */
    async clearFileStorage() {
        try {
            await (0, LaunchConfig_1.clearTestStorage)(this.page);
        }
        catch (error) {
            this.log(`Clearing test storage failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /** Run teardown steps; returns the failure message, or null when they passed. */
    async runTeardown(steps) {
        try {
            await this.executeSteps(steps, []);
            return null;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log(`Teardown failed: ${message}`);
            return message;
        }
    }
    /**
     * Run a flow test
     */
    async runFlowTest(test, testPath = '') {
        return this.inRun(testPath, () => this.runFlowTestFile(test));
    }
    async runFlowTestFile(test) {
        const startTime = Date.now();
        await this.ensureWindowOpenSpy();
        // Check platform compatibility. Emit a skipped row (not results: []) so the
        // flow-level skip stays visible in the report — "no silent truncation".
        if (!(0, types_1.platformIncludes)(test.platform, this.config.platform)) {
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
        const results = [];
        const warnings = [];
        let flowError = null;
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
            const screens = (0, InitialState_1.flowScreens)(test);
            const launchId = await this.applyLaunchSequence(test, screens);
            if (launchId !== undefined) {
                this.log('Reloading with the launch applied...');
                await this.page.reload();
                await this.ensureWindowOpenSpy();
            }
            if (launchId && screens) {
                for (const screenId of Object.keys(screens))
                    this.pendingReceipts.set(screenId, launchId);
            }
        }
        catch (error) {
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
            const attemptWarnings = [];
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
            }
            catch (error) {
                flowError = error instanceof Error ? error.message : String(error);
                this.log(`Flow test failed: ${flowError}`);
            }
            this.progress?.caseEnd(this.progressFile, test.metadata.name, 'flow', flowAttempts, flowError === null ? 'passed' : 'failed', Date.now() - attemptStarted);
            if (flowError === null || flowAttempts >= maxAttempts) {
                warnings.push(...attemptWarnings);
                if (flowError === null) {
                    for (const screenId of this.pendingReceipts.keys()) {
                        warnings.push(`initialState for screen '${screenId}' was never checked: the flow never reached it ` +
                            '(no step names that screen)');
                    }
                }
            }
            else {
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
            }
            catch (error) {
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
            }
            catch (error) {
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
    async runTestCaseWithRetries(testName, testCase) {
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
    async gateCase(testName, testCase) {
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
        if (!(0, types_1.platformIncludes)(testCase.platform, this.config.platform)) {
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
    async runTestCase(testName, testCase) {
        const startTime = Date.now();
        this.currentTestName = testName;
        this.currentCaseName = testCase.name;
        const gated = await this.gateCase(testName, testCase);
        if (gated)
            return gated;
        this.log(`Running case: ${testCase.name}`);
        // Apply load-time args substitution if test case has args
        const processedCase = TestLoader_1.TestLoader.applyArgsSubstitution(testCase);
        const warnings = [];
        try {
            await this.executeSteps(processedCase.steps, warnings);
            return this.withOrientation({
                testName,
                caseName: testCase.name,
                passed: true,
                warnings: warnings.length > 0 ? warnings : undefined,
                durationMs: Date.now() - startTime
            });
        }
        catch (error) {
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
                failureReason: (0, failureReason_1.classifyFailure)(error),
                warnings: warnings.length > 0 ? warnings : undefined,
                durationMs: Date.now() - startTime
            });
        }
    }
    async executeSteps(steps, warnings) {
        for (let index = 0; index < steps.length; index++) {
            const rawStep = steps[index];
            // Resolve runtime variables (@{name}) at execution time, after load-time args
            const step = TestLoader_1.TestLoader.substituteRuntimeVariables(rawStep, this.variables);
            this.log(`  Step ${index + 1}: ${this.stepDescription(step)}`);
            await this.executeStepGuarded(step, warnings);
        }
    }
    /**
     * Execute a single step honoring `when` (skip), `optional` (failure→warning),
     * and control steps (repeat/retry).
     */
    async executeStepGuarded(step, warnings) {
        // Evaluate `when` pre-condition
        if (step.when && !(await this.evaluateCondition(step.when))) {
            this.log(`    Skipped (when not satisfied): ${step.label ?? this.stepDescription(step)}`);
            return;
        }
        try {
            await this.executeStep(step, warnings);
        }
        catch (error) {
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
    async executeStep(step, warnings) {
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
        if ((0, types_1.isAction)(step)) {
            await this.actionExecutor.execute(step);
            // A `setOrientation` step is the top of the precedence chain, so what
            // the run DECLARES changes here. Recorded from the step rather than by
            // re-measuring: this half of the pair is the request, and measuring it
            // would collapse it onto the observed half.
            if (step.action === 'setOrientation' && step.orientation) {
                this.declaredOrientation = step.orientation;
            }
        }
        else if ((0, types_1.isAssertion)(step)) {
            await this.assertionExecutor.execute(step);
            // Drain warnings produced by the assertion (e.g. baseline created)
            if (this.assertionExecutor.warnings.length > 0) {
                warnings.push(...this.assertionExecutor.warnings);
                this.assertionExecutor.warnings = [];
            }
        }
        else {
            throw new Error("Step must have either 'action' or 'assert'");
        }
    }
    async executeRepeat(step, warnings) {
        const steps = step.steps ?? [];
        const hasTimes = typeof step.times === 'number';
        const hasWhile = step.while !== undefined;
        if (hasTimes && hasWhile) {
            // Loop while condition holds, at most `times` iterations (times is the cap)
            for (let i = 0; i < step.times; i++) {
                if (!(await this.evaluateCondition(step.while))) {
                    return;
                }
                await this.executeSteps(steps, warnings);
            }
            return;
        }
        if (hasTimes) {
            for (let i = 0; i < step.times; i++) {
                await this.executeSteps(steps, warnings);
            }
            return;
        }
        // while only: safety cap of REPEAT_WHILE_CAP
        for (let i = 0; i < REPEAT_WHILE_CAP; i++) {
            if (!(await this.evaluateCondition(step.while))) {
                return;
            }
            await this.executeSteps(steps, warnings);
        }
        // Cap reached while the condition still holds
        if (await this.evaluateCondition(step.while)) {
            throw new Error(`repeat exceeded ${REPEAT_WHILE_CAP} iterations (possible infinite loop)`);
        }
    }
    async executeRetry(step, warnings) {
        const steps = step.steps ?? [];
        const maxRetries = Math.min(step.maxRetries ?? 1, 3);
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Retried steps must NOT leak partial warnings on a failed attempt
                const attemptWarnings = [];
                await this.executeSteps(steps, attemptWarnings);
                warnings.push(...attemptWarnings);
                return;
            }
            catch (error) {
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
    async evaluateCondition(condition) {
        const unknown = (0, types_1.unknownConditionKeys)(condition);
        if (unknown.length > 0) {
            this.log(`    Condition has unsupported key(s) [${unknown.join(', ')}] - treating as unmet (fail-safe skip)`);
            return false;
        }
        if (condition.platform !== undefined) {
            if (!(0, types_1.platformIncludes)(condition.platform, this.config.platform)) {
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
            if (!(await (0, visibility_1.isHidden)(this.page.locator(`#${condition.hidden}`)))) {
                return false;
            }
        }
        if (condition.state !== undefined) {
            const found = await (0, StateProvider_1.lookupState)(this.stateProvider, condition.state.path);
            if (found.outcome === 'truncated') {
                throw new Error((0, StateProvider_1.TRUNCATED_MESSAGE)(condition.state.path, found.bytes));
            }
            // Pending / unresolved is "not met" — a condition does not wait.
            if (found.outcome !== 'value' || !(0, types_1.deepEquals)(found.value, condition.state.equals)) {
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
    async applyRunOrientation(declared) {
        const size = await (0, types_1.resolveViewportSize)(this.page);
        const tier = (0, types_1.resolveSizeTier)(size.width, this.config.responsive);
        const wanted = declared ?? (0, RunDefaults_1.defaultOrientationForTier)(this.config.runDefaults ?? null, tier);
        this.declaredOrientation = wanted;
        if (!wanted) {
            return;
        }
        if ((0, types_1.deriveOrientation)(size) === wanted) {
            return;
        }
        const viewport = this.page.viewportSize();
        if (!viewport) {
            // A viewport: null context sizes itself to the window; there is no
            // viewport to swap. Say so rather than silently recording a declared
            // orientation the run never applied — `observedOrientation` will
            // disagree, and this line is what explains the disagreement.
            this.log(`[orientation] declared '${wanted}' but no viewport is set ` +
                '(viewport: null context) - not applied');
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
    async observeOrientation() {
        try {
            return (0, types_1.deriveOrientation)(await (0, types_1.resolveViewportSize)(this.page));
        }
        catch {
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
    async withOrientation(result) {
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
    async currentSizeMatches(condition) {
        const size = await (0, types_1.resolveViewportSize)(this.page);
        return (0, types_1.matchesResponsive)(condition, size, this.config.responsive);
    }
    /** Instant visibility check (no polling) used by `when` conditions — the
     * same predicate as the `visible` assert (src/visibility.ts). */
    async isInstantlyVisible(id) {
        return (0, visibility_1.isInViewport)(this.page.locator(`#${id}`));
    }
    async executeFlowSteps(steps, warnings) {
        for (let index = 0; index < steps.length; index++) {
            const step = steps[index];
            if ((0, types_1.isFileReference)(step)) {
                this.log(`  Flow step ${index + 1}: file=${step.file}`);
            }
            else if ((0, types_1.isBlockStep)(step)) {
                this.log(`  Flow step ${index + 1}: block=${step.block}`);
            }
            else {
                this.log(`  Flow step ${index + 1}: screen=${step.screen}`);
            }
            await this.executeFlowStep(step, warnings);
        }
    }
    /**
     * Implicit screen verification (canon: implicitVerification). Runs BEFORE
     * the step, because the step is meant to run ON that screen.
     */
    async verifyScreenTransitionIfNeeded(step) {
        const screen = step.screen;
        if (!screen)
            return;
        // Same screen as the last executed step: nothing has changed.
        if (screen === this.trackedScreen)
            return;
        if (this.config.verifyScreenTransitions) {
            await this.assertionExecutor.execute({
                assert: 'screen',
                name: screen,
                timeout: this.config.screenTransitionTimeout,
            });
        }
        this.trackedScreen = screen;
        await this.checkReceiptOnArrival(screen);
    }
    /**
     * Flow: the first time the flow reaches a screen its initialState names,
     * the screen must have confirmed it (same judgement as a screen test).
     */
    async checkReceiptOnArrival(screen) {
        const launchId = this.pendingReceipts.get(screen);
        if (launchId === undefined)
            return;
        await (0, StateBridge_1.waitForReceipt)(this.page, screen, launchId, this.config.screenReadyTimeout);
        // Only once it passed: a retried flow body checks it again.
        this.pendingReceipts.delete(screen);
    }
    async executeFlowStep(step, warnings) {
        // Evaluate step-level `when` for file/block/inline steps
        if (step.when && !(await this.evaluateCondition(step.when))) {
            this.log(`    Skipped flow step (when not satisfied)`);
            return;
        }
        // Handle file reference steps
        if ((0, types_1.isFileReference)(step)) {
            // A file reference carries no screen of its own, and the case it runs
            // may end anywhere — reset to unknown so the next inline step is
            // verified rather than trusted.
            this.trackedScreen = undefined;
            await this.executeFileReferenceStep(step, warnings);
            return;
        }
        // Handle block steps (grouped inline actions)
        if ((0, types_1.isBlockStep)(step)) {
            await this.executeBlockStep(step, warnings);
            return;
        }
        // Handle inline steps - convert FlowTestStep to TestStep and execute
        if (step.screen)
            this.stateScreen = step.screen;
        await this.verifyScreenTransitionIfNeeded(step);
        await this.executeStepGuarded(this.toTestStep(step), warnings);
    }
    async executeBlockStep(step, warnings) {
        const blockSteps = step.steps;
        if (!blockSteps) {
            return;
        }
        this.log(`    Executing block: ${step.block}`);
        for (const innerStep of blockSteps) {
            await this.executeStepGuarded(this.toTestStep(innerStep), warnings);
        }
    }
    async executeFileReferenceStep(step, warnings) {
        const referenced = TestLoader_1.TestLoader.resolveFileReference(step.file);
        const testCases = TestLoader_1.TestLoader.resolveFileReferenceCases(step);
        for (const w of (0, InitialState_1.referencedInitialStateWarnings)(step, referenced)) {
            warnings.push((0, InitialState_1.referencedInitialStateMessage)(w));
        }
        // A referenced case reads state from its own file's screen.
        const outerStateScreen = this.stateScreen;
        this.stateScreen = (0, screenIdentity_1.screenIdFromLayout)(referenced.source?.layout) ?? outerStateScreen;
        try {
            await this.runReferencedCases(testCases, warnings);
        }
        finally {
            this.stateScreen = outerStateScreen;
        }
    }
    async runReferencedCases(testCases, warnings) {
        for (const testCase of testCases) {
            // Skip if marked to skip
            if (testCase.skip) {
                this.log(`    Skipping case: ${testCase.name}`);
                continue;
            }
            // Check platform compatibility
            if (!(0, types_1.platformIncludes)(testCase.platform, this.config.platform)) {
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
    toTestStep(step) {
        return {
            action: step.action,
            assert: step.assert,
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
    stepDescription(step) {
        if (step.action) {
            return `action=${step.action}, id=${step.id ?? step.ids?.join(',') ?? '-'}`;
        }
        if (step.assert) {
            return `assert=${step.assert}, id=${step.id ?? step.path ?? '-'}`;
        }
        return 'unknown step';
    }
    async takeScreenshot(name) {
        try {
            const path = `${this.config.screenshotDir}/${name}.png`;
            await this.page.screenshot({ path });
            this.log(`Screenshot saved: ${path}`);
        }
        catch (error) {
            this.log(`Failed to take screenshot: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    log(message) {
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
    notice(message) {
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
    async waitForScreenReady(test) {
        // A test's own declaration outranks the project-wide strategy: it is the
        // more specific statement, and it exists precisely for the files whose
        // answer differs from the project's.
        const declared = test.screenReady;
        if (declared === 'none') {
            this.notice("screen ready: no gate (this test declares screenReady: 'none'). " +
                'Nothing is awaited before setup — the test does its own waiting.');
            return;
        }
        if (typeof declared === 'object' && declared !== null) {
            this.notice(`screen ready: marker gate for '${declared.marker}' (declared by ` +
                'this test, in place of the id derived from source.layout).');
            await this.awaitMarker(declared.marker);
            return;
        }
        const screenId = (0, screenIdentity_1.screenIdFromLayout)(test.source?.layout);
        const strategy = declared ?? this.config.screenReadyStrategy;
        if (strategy === 'networkidle') {
            this.notice("screen ready: 'networkidle' gate (forced by " +
                `${declared ? 'this test' : 'screenReadyStrategy'}). ` +
                'A single hung request holds this open until the test times out.');
            await this.page.waitForLoadState('networkidle');
            return;
        }
        if (!screenId) {
            const where = test.source?.layout ? `'${test.source.layout}'` : '(absent)';
            if (strategy === 'marker') {
                throw new Error(`screen ready: 'marker' gate was forced but no screen id could be derived ` +
                    `from source.layout ${where}. Point source.layout at the screen's layout ` +
                    `file, or set screenReadyStrategy: 'networkidle'.`);
            }
            // Announced, not silent. This is the gate that hangs, and a run that
            // fell back into it without saying so is indistinguishable from one
            // that used the marker — until both fail the same way.
            this.notice(`screen ready: no screen id could be derived from source.layout ${where}, ` +
                "so this screen falls back to the 'networkidle' gate. A single hung " +
                'request holds it open until the test times out.');
            await this.page.waitForLoadState('networkidle');
            return;
        }
        if (strategy === 'marker') {
            this.notice(`screen ready: marker gate for '${screenId}' (forced by ` +
                `${declared ? 'this test' : 'screenReadyStrategy'}).`);
        }
        else {
            this.log(`Waiting for the '${screenId}' screen marker...`);
        }
        await this.awaitMarker(screenId);
    }
    /** Wait for one screen marker, or fail with the gate's own context added. */
    async awaitMarker(screenId) {
        try {
            await this.assertionExecutor.waitForScreenMarker(screenId, this.config.screenReadyTimeout);
        }
        catch (error) {
            // The diagnosis already separates production build / stale generated
            // code / navigated elsewhere. Only the gate's own context is added —
            // which wait this was, and the ways out. The per-test ones come first:
            // a screen that is *supposed* to be absent is the case the project-wide
            // switch answers by giving up the gate everywhere.
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`screen not ready: ${detail}\n` +
                `(readiness gate waited ${this.config.screenReadyTimeout}ms for the ` +
                `'${screenId}' marker. If this test expects the screen NOT to render — ` +
                'a permission refusal in its place, a redirect elsewhere — declare ' +
                "screenReady: 'none', or screenReady: { marker: '<other-screen>' } to " +
                'wait for where it lands instead. A project whose screens are all ' +
                "hand-written can set screenReadyStrategy: 'networkidle'.)");
        }
    }
}
exports.JsonUITestRunner = JsonUITestRunner;
/**
 * Builder for creating test runner instances
 */
class TestRunnerBuilder {
    constructor() {
        this.config = {};
    }
    defaultTimeout(timeout) {
        this.config.defaultTimeout = timeout;
        return this;
    }
    screenshotOnFailure(enabled) {
        this.config.screenshotOnFailure = enabled;
        return this;
    }
    screenshotDir(dir) {
        this.config.screenshotDir = dir;
        return this;
    }
    /** See TestRunnerConfig.testsDir. */
    testsDir(dir) {
        this.config.testsDir = dir;
        return this;
    }
    /** See TestRunnerConfig.afterLaunch. */
    afterLaunch(hook) {
        this.config.afterLaunch = hook;
        return this;
    }
    stateProvider(provider) {
        this.config.stateProvider = provider;
        return this;
    }
    baselineDir(dir) {
        this.config.baselineDir = dir;
        return this;
    }
    updateBaselines(enabled) {
        this.config.updateBaselines = enabled;
        return this;
    }
    /** Point the runner at a running mock server so `mocks` / `setMocks` work. */
    mockServer(url, token) {
        this.config.mockServerUrl = url;
        this.config.mockToken = token;
        return this;
    }
    /**
     * Override named-bucket width thresholds (logical px) for `responsive` gating.
     * Only for projects that also override the renderer's Tailwind breakpoints —
     * bucket names themselves are fixed.
     */
    responsiveThresholds(thresholds) {
        this.config.responsive = { ...this.config.responsive, ...thresholds };
        return this;
    }
    verbose(enabled) {
        this.config.verbose = enabled;
        return this;
    }
    build(page) {
        return new JsonUITestRunner(page, this.config);
    }
}
exports.TestRunnerBuilder = TestRunnerBuilder;
//# sourceMappingURL=JsonUITestRunner.js.map