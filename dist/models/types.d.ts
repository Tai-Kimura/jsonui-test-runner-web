/**
 * JsonUI Test Runner - Web Driver Models
 * Type definitions for test cases and results
 */
export interface ScreenTest {
    type: 'screen';
    source: TestSource;
    metadata: TestMetadata;
    platform?: PlatformTarget;
    initialState?: InitialState;
    /** App launch configuration (apply via applyLaunchConfig before navigation) */
    launch?: LaunchConfig;
    setup?: TestStep[];
    teardown?: TestStep[];
    cases: TestCase[];
}
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
export interface FlowTest {
    type: 'flow';
    sources?: FlowTestSource[];
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
    file?: string;
    case?: string;
    cases?: string[];
    /** Arguments to override screen test default args (for file reference steps) */
    args?: Record<string, unknown>;
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
export interface WhenCondition {
    /** Instant check: element is currently visible */
    visible?: string;
    /** Instant check: element is currently absent or invisible */
    notVisible?: string;
    /** Current platform matches (same matching rules as the step-level platform field) */
    platform?: PlatformTarget;
    /** ViewModel state matches (requires a state provider) */
    state?: {
        path: string;
        equals: unknown;
    };
}
export type LaunchPermissionValue = 'allow' | 'deny' | 'unset';
export interface LaunchConfig {
    /** Clear cookies + local/session storage for the origin before launch */
    clearState?: boolean;
    /** Permission grants applied before launch (camera, microphone, location, notifications, photos, contacts, calendar, bluetooth) */
    permissions?: Record<string, LaunchPermissionValue>;
    /** Launch arguments written to sessionStorage["JSONUI_TEST_ARGS"] as JSON */
    arguments?: Record<string, string | number | boolean>;
}
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
}
export type ActionType = 'tap' | 'doubleTap' | 'longPress' | 'input' | 'clear' | 'scroll' | 'scrollUntilVisible' | 'swipe' | 'waitFor' | 'waitForAny' | 'wait' | 'back' | 'screenshot' | 'alertTap' | 'selectOption' | 'tapItem' | 'selectTab' | 'readText' | 'repeat' | 'retry' | 'setLocation' | 'addMedia';
export type AssertionType = 'visible' | 'notVisible' | 'enabled' | 'disabled' | 'text' | 'count' | 'state' | 'screenshot';
export type PlatformTarget = string | string[];
export declare function platformIncludes(target: PlatformTarget | undefined, platform: string): boolean;
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
export declare function getPassedCount(result: TestSuiteResult): number;
export declare function getFailedCount(result: TestSuiteResult): number;
export declare function allPassed(result: TestSuiteResult): boolean;
export type LoadedTest = {
    type: 'screen';
    test: ScreenTest;
    filePath: string;
} | {
    type: 'flow';
    test: FlowTest;
    filePath: string;
};
export declare function isAction(step: TestStep): boolean;
export declare function isAssertion(step: TestStep): boolean;
export declare function isFileReference(step: FlowTestStep): boolean;
/**
 * Deep equality for state values (primitives compared strictly, objects/arrays structurally)
 */
export declare function deepEquals(a: unknown, b: unknown): boolean;
export declare function isBlockStep(step: FlowTestStep): boolean;
export declare function isInlineStep(step: FlowTestStep): boolean;
//# sourceMappingURL=types.d.ts.map