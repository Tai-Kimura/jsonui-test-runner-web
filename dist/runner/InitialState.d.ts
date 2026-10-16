/**
 * JsonUI Test Runner - Web Driver
 * initialState: which launches a file makes and what each one carries
 * (spec §10.2, fixed by specs/vectors/initial-state-payload.json).
 *
 * The driver does not judge the values. An unknown key, a null or a value of
 * the wrong type travels in the payload as written; the app checks it against
 * the screen's Data and reports what it rejected through the state bridge,
 * and the driver fails on that report (StateBridge.waitForReceipt).
 */
import { Page } from 'playwright';
import { FlowTest, FlowTestStep, ScreenTest, TestCase } from '../models/types';
/** sessionStorage key the app reads the payload from. */
export declare const INITIAL_STATE_KEY = "JSONUI_TEST_INITIAL_STATE";
/** Codes shared with the other drivers and `jsonui-test validate` (spec §10.7). */
export declare const CASE_INITIAL_STATE_NEEDS_REOPEN = "case-initial-state-needs-reopen";
export declare const REFERENCED_INITIAL_STATE_IGNORED = "referenced-initial-state-ignored";
/** screen id -> { Data name -> value as written } */
export type InitialStateScreens = Record<string, Record<string, unknown>>;
export interface InitialStatePayload {
    version: 1;
    /** A fresh UUID per launch; the app echoes it on the bridge with its receipt. */
    launchId: string;
    screens: InitialStateScreens;
}
/** True when the case writes a non-empty initialState of its own. */
export declare function caseHasInitialState(testCase: TestCase): boolean;
/**
 * The screens a screen test's launch carries: the screen under test with the
 * file's viewModel, merged key by key (shallow) with the case's when a case is
 * given (reopen). Null when there is nothing to deliver — an empty viewModel is
 * the same as none.
 */
export declare function screenTestScreens(test: ScreenTest, testCase?: TestCase): InitialStateScreens | null;
/** A flow's payload screens: `initialState.viewModels` as written, or null when empty. */
export declare function flowScreens(test: FlowTest): InitialStateScreens | null;
/** A launch happens only for a `launch`, `mocks` or a payload (spec §10.2). */
export declare function launchNeeded(test: {
    launch?: unknown;
    mocks?: unknown;
}, screens: InitialStateScreens | null): boolean;
/** A case-level initialState in a `shared` file cannot be delivered. */
export declare function caseNeedsReopen(test: ScreenTest, testCase: TestCase): boolean;
export declare function caseNeedsReopenMessage(caseName: string): string;
export interface ReferencedInitialStateWarning {
    code: typeof REFERENCED_INITIAL_STATE_IGNORED;
    file: string;
    case?: string;
}
/**
 * What a flow's file reference would have delivered and does not: the
 * referenced file's own initialState and that of each case the step runs. The
 * flow's launch has already happened, so they are ignored and warned about.
 */
export declare function referencedInitialStateWarnings(step: FlowTestStep, referenced: ScreenTest): ReferencedInitialStateWarning[];
export declare function referencedInitialStateMessage(w: ReferencedInitialStateWarning): string;
export declare function makePayload(screens: InitialStateScreens): InitialStatePayload;
/**
 * Write the payload to sessionStorage, or remove a stale one when this launch
 * carries none. Step 4 of the launch sequence: after arguments, before mocks.
 */
export declare function writeInitialState(page: Page, payload: InitialStatePayload | null): Promise<void>;
export interface PlannedLaunch {
    /** 'file' (once, before the first case) or 'case:<name>' (reopen) */
    before: string;
    screens: InitialStateScreens | null;
}
export interface LaunchPlan {
    launches: PlannedLaunch[];
    caseFailures: {
        case: string;
        failureReason: 'setup';
        code: string;
    }[];
    warnings: ReferencedInitialStateWarning[];
}
/**
 * The launches a file makes, in order, with the cases failed before running
 * and the warnings. Built from the same functions the runner calls; the only
 * case gate it models is `skip` (platform / responsive need a live page).
 */
export declare function planLaunches(test: ScreenTest | FlowTest, resolveFile?: (ref: string) => ScreenTest): LaunchPlan;
//# sourceMappingURL=InitialState.d.ts.map