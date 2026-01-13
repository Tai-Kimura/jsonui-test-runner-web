/**
 * JsonUI Test Runner - Web Driver
 *
 * A Playwright-based test runner for ReactJsonUI applications.
 * Executes JSON-defined UI tests against web applications.
 */
export * from './models/types';
export { ActionExecutor } from './actions/ActionExecutor';
export { AssertionExecutor } from './assertions/AssertionExecutor';
export { TestLoader } from './runner/TestLoader';
export { JsonUITestRunner, TestRunnerBuilder, TestRunnerConfig } from './runner/JsonUITestRunner';
import { TestRunnerBuilder } from './runner/JsonUITestRunner';
export declare function createRunner(): TestRunnerBuilder;
//# sourceMappingURL=index.d.ts.map