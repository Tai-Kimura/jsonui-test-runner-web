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
}
export interface FlowTest {
    type: 'flow';
    sources: FlowTestSource[];
    metadata: TestMetadata;
    platform?: PlatformTarget;
    initialState?: FlowInitialState;
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
    screen: string;
    action?: string;
    assert?: string;
    id?: string;
    ids?: string[];
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
}
export interface Checkpoint {
    name: string;
    afterStep: number;
    screenshot?: boolean;
}
export interface TestStep {
    action?: ActionType;
    assert?: AssertionType;
    id?: string;
    ids?: string[];
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
}
export type ActionType = 'tap' | 'doubleTap' | 'longPress' | 'input' | 'clear' | 'scroll' | 'swipe' | 'waitFor' | 'waitForAny' | 'wait' | 'back' | 'screenshot';
export type AssertionType = 'visible' | 'notVisible' | 'enabled' | 'disabled' | 'text' | 'count';
export type PlatformTarget = string | string[];
export declare function platformIncludes(target: PlatformTarget | undefined, platform: string): boolean;
export interface TestResult {
    testName: string;
    caseName: string;
    passed: boolean;
    error?: string;
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
//# sourceMappingURL=types.d.ts.map