"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * Main test runner using Playwright
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestRunnerBuilder = exports.JsonUITestRunner = void 0;
const ActionExecutor_1 = require("../actions/ActionExecutor");
const AssertionExecutor_1 = require("../assertions/AssertionExecutor");
const types_1 = require("../models/types");
const TestLoader_1 = require("./TestLoader");
const MockClient_1 = require("./MockClient");
/** Safety cap for `repeat` with a `while` condition and no `times` */
const REPEAT_WHILE_CAP = 100;
const DEFAULT_CONFIG = {
    defaultTimeout: 5000,
    verifyScreenTransitions: false,
    screenTransitionTimeout: 10000,
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
        this.assertionExecutor = new AssertionExecutor_1.AssertionExecutor(page, this.config.defaultTimeout, {
            stateProvider: this.config.stateProvider,
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
     * Run a screen test
     */
    async runScreenTest(test, _testPath = '') {
        const results = [];
        const startTime = Date.now();
        await this.ensureWindowOpenSpy();
        // Check platform compatibility. Emit a skipped row per case (not results: [])
        // so file-level skips stay visible in the report — "no silent truncation".
        if (!(0, types_1.platformIncludes)(test.platform, this.config.platform)) {
            this.log('Skipping test - platform mismatch');
            return {
                suiteName: test.metadata.name,
                results: test.cases.map(testCase => ({
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
        // Artifact identity for this file (setup/teardown captures carry the
        // phase name until runTestCase overwrites the case name).
        this.currentTestName = test.metadata.name;
        this.currentCaseName = 'setup';
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
        let setupError = null;
        if (test.setup) {
            this.log('Running setup...');
            try {
                await this.executeSteps(test.setup, []);
            }
            catch (error) {
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
            this.currentCaseName = 'teardown';
            try {
                await this.executeSteps(test.teardown, []);
            }
            catch (error) {
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
     * Run a flow test
     */
    async runFlowTest(test, _testPath = '') {
        const startTime = Date.now();
        await this.ensureWindowOpenSpy();
        // Check platform compatibility. Emit a skipped row (not results: []) so the
        // flow-level skip stays visible in the report — "no silent truncation".
        if (!(0, types_1.platformIncludes)(test.platform, this.config.platform)) {
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
        const results = [];
        const warnings = [];
        let flowError = null;
        // A flow acts as a single case for artifact identity purposes.
        this.currentTestName = test.metadata.name;
        this.currentCaseName = 'flow';
        // Apply the file-level mock scenario set BEFORE the flow fetches, then reload
        // so startup runs under the selected scenarios. Parity with runScreenTest
        // (§8.1); a failure here fails the flow rather than silently running default.
        if (test.mocks) {
            try {
                this.log('Applying flow mock scenarios and reloading...');
                await this.requireMockClient('mocks').scenarioSet(test.mocks);
                await this.page.reload();
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const result = {
                    suiteName: test.metadata.name,
                    results: [{
                            testName: test.metadata.name,
                            caseName: 'flow',
                            passed: false,
                            error: message,
                            durationMs: Date.now() - startTime
                        }],
                    totalDurationMs: Date.now() - startTime
                };
                return result;
            }
        }
        try {
            // Run setup
            if (test.setup) {
                this.log('Running flow setup...');
                await this.executeFlowSteps(test.setup, warnings);
            }
            // Run flow steps
            this.log('Running flow steps...');
            await this.executeFlowSteps(test.steps, warnings);
        }
        catch (error) {
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
            }
            catch (error) {
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
    async runTestCase(testName, testCase) {
        const startTime = Date.now();
        this.currentTestName = testName;
        this.currentCaseName = testCase.name;
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
        if (!(0, types_1.platformIncludes)(testCase.platform, this.config.platform)) {
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
        const processedCase = TestLoader_1.TestLoader.applyArgsSubstitution(testCase);
        const warnings = [];
        try {
            await this.executeSteps(processedCase.steps, warnings);
            return {
                testName,
                caseName: testCase.name,
                passed: true,
                warnings: warnings.length > 0 ? warnings : undefined,
                durationMs: Date.now() - startTime
            };
        }
        catch (error) {
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
        if (condition.state !== undefined) {
            if (!this.config.stateProvider) {
                throw new Error(`Cannot evaluate state condition '${condition.state.path}': no state provider configured`);
            }
            const actual = await this.config.stateProvider.getValue(condition.state.path);
            if (!(0, types_1.deepEquals)(actual, condition.state.equals)) {
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
    async currentSizeMatches(condition) {
        const size = await (0, types_1.resolveViewportSize)(this.page);
        return (0, types_1.matchesResponsive)(condition, size, this.config.responsive);
    }
    /** Instant visibility check (no polling) used by conditions */
    async isInstantlyVisible(id) {
        const element = this.page.locator(`#${id}`);
        if (await element.count() === 0) {
            return false;
        }
        return element.first().isVisible();
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
        if (!this.config.verifyScreenTransitions)
            return;
        const screen = step.screen;
        if (!screen)
            return;
        // Same screen as the last executed step: nothing has changed.
        if (screen === this.trackedScreen)
            return;
        await this.assertionExecutor.execute({
            assert: 'screen',
            name: screen,
            timeout: this.config.screenTransitionTimeout,
        });
        this.trackedScreen = screen;
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
        const testCases = TestLoader_1.TestLoader.resolveFileReferenceCases(step);
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