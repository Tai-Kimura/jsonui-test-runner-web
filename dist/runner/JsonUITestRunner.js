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
const DEFAULT_CONFIG = {
    defaultTimeout: 5000,
    screenshotOnFailure: true,
    screenshotDir: './screenshots',
    platform: 'web',
    verbose: false
};
/**
 * Main test runner for JsonUI tests
 */
class JsonUITestRunner {
    constructor(page, config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.page = page;
        this.actionExecutor = new ActionExecutor_1.ActionExecutor(page, this.config.defaultTimeout);
        this.assertionExecutor = new AssertionExecutor_1.AssertionExecutor(page, this.config.defaultTimeout);
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
        // Wait for UI to be ready
        this.log('Waiting for UI to be ready...');
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(500);
        // Check platform compatibility
        if (!(0, types_1.platformIncludes)(test.platform, this.config.platform)) {
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
            }
            catch (error) {
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
            }
            catch (error) {
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
    async runFlowTest(test, _testPath = '') {
        const startTime = Date.now();
        // Check platform compatibility
        if (!(0, types_1.platformIncludes)(test.platform, this.config.platform)) {
            this.log('Skipping flow test - platform mismatch');
            return {
                suiteName: test.metadata.name,
                results: [],
                totalDurationMs: 0
            };
        }
        const result = await (async () => {
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
            }
            catch (error) {
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
    async runTestCase(testName, testCase) {
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
        if (!(0, types_1.platformIncludes)(testCase.platform, this.config.platform)) {
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
                durationMs: Date.now() - startTime
            };
        }
    }
    async executeSteps(steps) {
        for (let index = 0; index < steps.length; index++) {
            const step = steps[index];
            this.log(`  Step ${index + 1}: ${this.stepDescription(step)}`);
            await this.executeStep(step);
        }
    }
    async executeFlowSteps(steps) {
        for (let index = 0; index < steps.length; index++) {
            const step = steps[index];
            this.log(`  Flow step ${index + 1}: screen=${step.screen}`);
            await this.executeFlowStep(step);
        }
    }
    async executeStep(step) {
        if ((0, types_1.isAction)(step)) {
            await this.actionExecutor.execute(step);
        }
        else if ((0, types_1.isAssertion)(step)) {
            await this.assertionExecutor.execute(step);
        }
        else {
            throw new Error("Step must have either 'action' or 'assert'");
        }
    }
    async executeFlowStep(step) {
        // Convert FlowTestStep to TestStep and execute
        const testStep = {
            action: step.action,
            assert: step.assert,
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
    stepDescription(step) {
        if (step.action) {
            return `action=${step.action}, id=${step.id ?? step.ids?.join(',') ?? '-'}`;
        }
        if (step.assert) {
            return `assert=${step.assert}, id=${step.id ?? '-'}`;
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