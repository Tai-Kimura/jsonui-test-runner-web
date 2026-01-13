/**
 * JsonUI Test Runner - Web Driver
 *
 * A Playwright-based test runner for ReactJsonUI applications.
 * Executes JSON-defined UI tests against web applications.
 */

// Models
export * from './models/types';

// Actions
export { ActionExecutor } from './actions/ActionExecutor';

// Assertions
export { AssertionExecutor } from './assertions/AssertionExecutor';

// Runner
export { TestLoader } from './runner/TestLoader';
export { JsonUITestRunner, TestRunnerBuilder, TestRunnerConfig } from './runner/JsonUITestRunner';

// Convenience function for creating test runners
import { TestRunnerBuilder } from './runner/JsonUITestRunner';

export function createRunner(): TestRunnerBuilder {
  return new TestRunnerBuilder();
}
