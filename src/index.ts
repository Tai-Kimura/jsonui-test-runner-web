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
export { StateProvider, BridgeStateProvider } from './runner/StateProvider';
export { MockClient } from './runner/MockClient';
export { ResultsWriter, ResultsJson, ResultsJsonSuite, ResultsJsonResult } from './runner/ResultsWriter';
export {
  loadRunDefaults,
  defaultOrientationForTier,
  RUN_DEFAULTS_FILENAME,
  SUPPORTED_SCHEMA_VERSION,
  RunDefaultsLoad,
  RunDefaultsMiss
} from './runner/RunDefaults';
export { applyLaunchToPage, clearTestStorage, ARGS_KEY } from './runner/LaunchConfig';
export {
  INITIAL_STATE_KEY,
  InitialStatePayload,
  InitialStateScreens,
  planLaunches,
  LaunchPlan,
  PlannedLaunch
} from './runner/InitialState';
export {
  readBridge,
  waitForReceipt,
  resolveStatePath,
  lookupInBridge,
  BridgeSnapshot,
  InitialStateReceipt,
  StateLookup
} from './runner/StateBridge';

// Convenience function for creating test runners
import { TestRunnerBuilder } from './runner/JsonUITestRunner';

export function createRunner(): TestRunnerBuilder {
  return new TestRunnerBuilder();
}
