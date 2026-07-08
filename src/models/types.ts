/**
 * JsonUI Test Runner - Web Driver Models
 * Type definitions for test cases and results
 */

// MARK: - Screen Test

export interface ScreenTest {
  type: 'screen';
  source: TestSource;
  metadata: TestMetadata;
  platform?: PlatformTarget;
  initialState?: InitialState;
  /** App launch configuration (apply via applyLaunchConfig before navigation) */
  launch?: LaunchConfig;
  /** API mock scenario set applied (and the screen reloaded) before the cases run */
  mocks?: MockScenarioMap;
  setup?: TestStep[];
  teardown?: TestStep[];
  cases: TestCase[];
}

/** Map of OpenAPI operationId -> mock scenario name */
export type MockScenarioMap = Record<string, string>;

export interface TestSource {
  layout: string;
  spec?: string;
}

export interface TestMetadata {
  name: string;
  description?: string;
  generatedAt?: string;
  generatedBy?: string;
  tags?: string[];
}

export interface InitialState {
  viewModel?: Record<string, unknown>;
}

export interface TestCase {
  name: string;
  description?: string;
  skip?: boolean;
  platform?: PlatformTarget;
  initialState?: InitialState;
  steps: TestStep[];
  /** Default argument values for @{varName} substitution */
  args?: Record<string, unknown>;
}

// MARK: - Flow Test

export interface FlowTest {
  type: 'flow';
  sources?: FlowTestSource[];  // Now optional (not needed when using file references)
  metadata: TestMetadata;
  platform?: PlatformTarget;
  initialState?: FlowInitialState;
  /** App launch configuration (apply via applyLaunchConfig before navigation) */
  launch?: LaunchConfig;
  setup?: FlowTestStep[];
  teardown?: FlowTestStep[];
  steps: FlowTestStep[];
  checkpoints?: Checkpoint[];
}

export interface FlowTestSource {
  layout: string;
  spec?: string;
  alias?: string;
}

export interface FlowInitialState {
  screen?: string;
  viewModels?: Record<string, Record<string, unknown>>;
}

export interface FlowTestStep {
  // For inline steps
  screen?: string;
  action?: string;
  assert?: string;
  id?: string;
  ids?: string[];
  text?: string;
  value?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  timeout?: number;
  ms?: number;
  name?: string;
  equals?: unknown;
  contains?: string;
  path?: string;
  amount?: number;
  button?: string;
  label?: string;
  index?: number;
  /** When true, a failure of this step is recorded as a warning and execution continues */
  optional?: boolean;
  /** Pre-condition; step is skipped when not satisfied (also valid on file/block steps) */
  when?: WhenCondition;
  /** Re-tap once when the UI did not change after the tap (accepted, no-op on web) */
  retryTapIfNoChange?: boolean;
  /** Scrollable container id for scrollUntilVisible */
  container?: string;
  /** Runtime variable name for readText */
  variable?: string;
  /** Iteration count for repeat */
  times?: number;
  /** Loop condition for repeat */
  while?: WhenCondition;
  /** Number of retries for retry (0-3) */
  maxRetries?: number;
  /** Latitude for setLocation */
  latitude?: number;
  /** Longitude for setLocation */
  longitude?: number;
  /** Media file paths for addMedia */
  paths?: string[];
  /** Crop element id for screenshot assertion */
  cropId?: string;
  /** Similarity threshold (0-100) for screenshot assertion */
  threshold?: number;
  /** Scenario map for the setMocks action (operationId -> scenario) */
  mocks?: MockScenarioMap;
  // For file reference steps
  file?: string;
  case?: string;
  cases?: string[];
  /** Arguments to override screen test default args (for file reference steps) */
  args?: Record<string, unknown>;
  // For block steps (grouped inline actions)
  block?: string;
  description?: string;
  descriptionFile?: string;
  steps?: FlowTestStep[];
}

export interface Checkpoint {
  name: string;
  afterStep: number;
  screenshot?: boolean;
}

// MARK: - Condition (for 'when' and 'repeat.while')

export interface WhenCondition {
  /** Instant check: element is currently visible */
  visible?: string;
  /** Instant check: element is currently absent or invisible */
  notVisible?: string;
  /** Current platform matches (same matching rules as the step-level platform field) */
  platform?: PlatformTarget;
  /** ViewModel state matches (requires a state provider) */
  state?: { path: string; equals: unknown };
}

// MARK: - Launch Configuration

export type LaunchPermissionValue = 'allow' | 'deny' | 'unset';

export interface LaunchConfig {
  /** Clear cookies + local/session storage for the origin before launch */
  clearState?: boolean;
  /** Permission grants applied before launch (camera, microphone, location, notifications, photos, contacts, calendar, bluetooth) */
  permissions?: Record<string, LaunchPermissionValue>;
  /** Launch arguments written to sessionStorage["JSONUI_TEST_ARGS"] as JSON */
  arguments?: Record<string, string | number | boolean>;
}

// MARK: - Test Step (for Screen Tests)

export interface TestStep {
  action?: ActionType;
  assert?: AssertionType;
  id?: string;
  ids?: string[];
  text?: string;
  value?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  timeout?: number;
  ms?: number;
  name?: string;
  equals?: unknown;
  contains?: string;
  path?: string;
  amount?: number;
  button?: string;
  label?: string;
  index?: number;
  /** When true, a failure of this step is recorded as a warning and execution continues */
  optional?: boolean;
  /** Pre-condition; step is skipped when not satisfied */
  when?: WhenCondition;
  /** Re-tap once when the UI did not change after the tap (accepted, no-op on web) */
  retryTapIfNoChange?: boolean;
  /** Scrollable container id for scrollUntilVisible */
  container?: string;
  /** Runtime variable name for readText */
  variable?: string;
  /** Iteration count for repeat */
  times?: number;
  /** Loop condition for repeat */
  while?: WhenCondition;
  /** Nested steps for repeat/retry control steps */
  steps?: TestStep[];
  /** Number of retries for retry (0-3) */
  maxRetries?: number;
  /** Latitude for setLocation */
  latitude?: number;
  /** Longitude for setLocation */
  longitude?: number;
  /** Media file paths for addMedia */
  paths?: string[];
  /** Crop element id for screenshot assertion */
  cropId?: string;
  /** Similarity threshold (0-100) for screenshot assertion */
  threshold?: number;
  /** Scenario map for the setMocks action (operationId -> scenario) */
  mocks?: MockScenarioMap;
}

// MARK: - Action & Assertion Types

export type ActionType =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'input'
  | 'clear'
  | 'scroll'
  | 'scrollUntilVisible'
  | 'swipe'
  | 'waitFor'
  | 'waitForAny'
  | 'wait'
  | 'back'
  | 'screenshot'
  | 'alertTap'
  | 'selectOption'
  | 'tapItem'
  | 'selectTab'
  | 'readText'
  | 'repeat'
  | 'retry'
  | 'setLocation'
  | 'addMedia'
  | 'setMocks';

export type AssertionType =
  | 'visible'
  | 'notVisible'
  | 'enabled'
  | 'disabled'
  | 'text'
  | 'count'
  | 'state'
  | 'screenshot';

// MARK: - Platform Target

export type PlatformTarget = string | string[];

export function platformIncludes(target: PlatformTarget | undefined, platform: string): boolean {
  if (!target) return true;
  if (typeof target === 'string') {
    return target === platform || target === 'all';
  }
  return target.includes(platform);
}

// MARK: - Test Result

export interface TestResult {
  testName: string;
  caseName: string;
  passed: boolean;
  /** True when the case was skipped (skip flag or platform mismatch); passed stays true for compatibility */
  skipped?: boolean;
  error?: string;
  /** Warnings collected during the case (optional-step failures, baseline created, ...) */
  warnings?: string[];
  durationMs: number;
}

export interface TestSuiteResult {
  suiteName: string;
  results: TestResult[];
  totalDurationMs: number;
}

export function getPassedCount(result: TestSuiteResult): number {
  return result.results.filter(r => r.passed).length;
}

export function getFailedCount(result: TestSuiteResult): number {
  return result.results.filter(r => !r.passed).length;
}

export function allPassed(result: TestSuiteResult): boolean {
  return result.results.every(r => r.passed);
}

// MARK: - Loaded Test

export type LoadedTest =
  | { type: 'screen'; test: ScreenTest; filePath: string }
  | { type: 'flow'; test: FlowTest; filePath: string };

// MARK: - Helper Functions

export function isAction(step: TestStep): boolean {
  return step.action !== undefined;
}

export function isAssertion(step: TestStep): boolean {
  return step.assert !== undefined;
}

export function isFileReference(step: FlowTestStep): boolean {
  return step.file !== undefined;
}

/**
 * Deep equality for state values (primitives compared strictly, objects/arrays structurally)
 */
export function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isBlockStep(step: FlowTestStep): boolean {
  return step.block !== undefined;
}

export function isInlineStep(step: FlowTestStep): boolean {
  return step.screen !== undefined && (step.action !== undefined || step.assert !== undefined);
}
