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
import { randomUUID } from 'crypto';
import { FlowTest, FlowTestStep, ScreenTest, TestCase } from '../models/types';
import { screenIdFromLayout } from './screenIdentity';

/** sessionStorage key the app reads the payload from. */
export const INITIAL_STATE_KEY = 'JSONUI_TEST_INITIAL_STATE';

/** Codes shared with the other drivers and `jsonui-test validate` (spec §10.7). */
export const CASE_INITIAL_STATE_NEEDS_REOPEN = 'case-initial-state-needs-reopen';
export const REFERENCED_INITIAL_STATE_IGNORED = 'referenced-initial-state-ignored';

/** screen id -> { Data name -> value as written } */
export type InitialStateScreens = Record<string, Record<string, unknown>>;

export interface InitialStatePayload {
  version: 1;
  /** A fresh UUID per launch; the app echoes it on the bridge with its receipt. */
  launchId: string;
  screens: InitialStateScreens;
  /**
   * Web only: when the payload was written, `Date.now()` in the page (ms since
   * the epoch, the browser's clock). Set by writeInitialState. The app consumes
   * the payload only in a document whose `performance.timeOrigin` is later —
   * the document the launch's reload / goto opens — so a document that was
   * still hydrating when the payload was written cannot take it first.
   */
  writtenAt?: number;
}

function nonEmpty(viewModel: Record<string, unknown> | undefined | null): viewModel is Record<string, unknown> {
  return !!viewModel && typeof viewModel === 'object' && Object.keys(viewModel).length > 0;
}

/** True when the case writes a non-empty initialState of its own. */
export function caseHasInitialState(testCase: TestCase): boolean {
  return nonEmpty(testCase.initialState?.viewModel);
}

/**
 * The screens a screen test's launch carries: the screen under test with the
 * file's viewModel, merged key by key (shallow) with the case's when a case is
 * given (reopen). Null when there is nothing to deliver — an empty viewModel is
 * the same as none.
 */
export function screenTestScreens(test: ScreenTest, testCase?: TestCase): InitialStateScreens | null {
  const merged: Record<string, unknown> = {
    ...(test.initialState?.viewModel ?? {}),
    ...(testCase?.initialState?.viewModel ?? {})
  };
  if (!nonEmpty(merged)) return null;
  const screenId = screenIdFromLayout(test.source?.layout);
  if (!screenId) {
    throw new Error(
      `initialState needs the screen under test, and no screen id could be derived from ` +
      `source.layout ('${test.source?.layout ?? '(absent)'}').`
    );
  }
  return { [screenId]: merged };
}

/** A flow's payload screens: `initialState.viewModels` as written, or null when empty. */
export function flowScreens(test: FlowTest): InitialStateScreens | null {
  const viewModels = test.initialState?.viewModels;
  if (!viewModels || Object.keys(viewModels).length === 0) return null;
  return { ...viewModels };
}

/** A launch happens only for a `launch`, `mocks` or a payload (spec §10.2). */
export function launchNeeded(
  test: { launch?: unknown; mocks?: unknown },
  screens: InitialStateScreens | null
): boolean {
  return test.launch !== undefined || test.mocks !== undefined || screens !== null;
}

/** A case-level initialState in a `shared` file cannot be delivered. */
export function caseNeedsReopen(test: ScreenTest, testCase: TestCase): boolean {
  return (test.caseIsolation ?? 'shared') === 'shared' && caseHasInitialState(testCase);
}

export function caseNeedsReopenMessage(caseName: string): string {
  return (
    `[${CASE_INITIAL_STATE_NEEDS_REOPEN}] case '${caseName}' declares its own initialState, ` +
    "which a 'shared' file cannot deliver: the screen is opened once, before the first case. " +
    "Set caseIsolation: 'reopen' on the file, or move the values to the file's initialState."
  );
}

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
export function referencedInitialStateWarnings(
  step: FlowTestStep,
  referenced: ScreenTest
): ReferencedInitialStateWarning[] {
  const file = step.file as string;
  const warnings: ReferencedInitialStateWarning[] = [];
  if (nonEmpty(referenced.initialState?.viewModel)) {
    warnings.push({ code: REFERENCED_INITIAL_STATE_IGNORED, file });
  }
  const names = step.case !== undefined
    ? [step.case]
    : step.cases && step.cases.length > 0
      ? step.cases
      : referenced.cases.map(c => c.name);
  for (const name of names) {
    const testCase = referenced.cases.find(c => c.name === name);
    if (testCase && caseHasInitialState(testCase)) {
      warnings.push({ code: REFERENCED_INITIAL_STATE_IGNORED, file, case: name });
    }
  }
  return warnings;
}

export function referencedInitialStateMessage(w: ReferencedInitialStateWarning): string {
  const what = w.case !== undefined ? `case '${w.case}' of '${w.file}'` : `'${w.file}'`;
  return (
    `[${REFERENCED_INITIAL_STATE_IGNORED}] the initialState of ${what} is not applied inside a flow ` +
    "(the flow's launch has already happened); put the values in the flow's initialState.viewModels."
  );
}

export function makePayload(screens: InitialStateScreens): InitialStatePayload {
  return { version: 1, launchId: randomUUID(), screens };
}

/**
 * Write the payload to sessionStorage, stamped with `writtenAt` (the page's
 * `Date.now()`), or remove a stale one when this launch carries none. Step 4
 * of the launch sequence: after arguments (and afterLaunch), before mocks.
 */
export async function writeInitialState(page: Page, payload: InitialStatePayload | null): Promise<void> {
  await page.evaluate(
    ([key, json]) => {
      if (json === null) {
        window.sessionStorage.removeItem(key);
        return;
      }
      const stamped = { ...JSON.parse(json), writtenAt: Date.now() };
      window.sessionStorage.setItem(key, JSON.stringify(stamped));
    },
    [INITIAL_STATE_KEY, payload === null ? null : JSON.stringify(payload)] as [string, string | null]
  );
}

// MARK: - The plan (what the runner does, as data — run against the vector)

export interface PlannedLaunch {
  /** 'file' (once, before the first case) or 'case:<name>' (reopen) */
  before: string;
  screens: InitialStateScreens | null;
}

export interface LaunchPlan {
  launches: PlannedLaunch[];
  caseFailures: { case: string; failureReason: 'setup'; code: string }[];
  warnings: ReferencedInitialStateWarning[];
}

/**
 * The launches a file makes, in order, with the cases failed before running
 * and the warnings. Built from the same functions the runner calls; the only
 * case gate it models is `skip` (platform / responsive need a live page).
 */
export function planLaunches(
  test: ScreenTest | FlowTest,
  resolveFile: (ref: string) => ScreenTest = () => { throw new Error('no referenced files'); }
): LaunchPlan {
  const plan: LaunchPlan = { launches: [], caseFailures: [], warnings: [] };
  if (test.type === 'flow') {
    const screens = flowScreens(test);
    if (launchNeeded(test, screens)) plan.launches.push({ before: 'file', screens });
    for (const step of [...(test.setup ?? []), ...test.steps, ...(test.teardown ?? [])]) {
      if (step.file !== undefined) {
        plan.warnings.push(...referencedInitialStateWarnings(step, resolveFile(step.file)));
      }
    }
    return plan;
  }

  if (test.caseIsolation === 'reopen') {
    for (const testCase of test.cases) {
      if (testCase.skip) continue;
      plan.launches.push({ before: `case:${testCase.name}`, screens: screenTestScreens(test, testCase) });
    }
    return plan;
  }

  const screens = screenTestScreens(test);
  if (launchNeeded(test, screens)) plan.launches.push({ before: 'file', screens });
  for (const testCase of test.cases) {
    if (testCase.skip) continue;
    if (caseNeedsReopen(test, testCase)) {
      plan.caseFailures.push({ case: testCase.name, failureReason: 'setup', code: CASE_INITIAL_STATE_NEEDS_REOPEN });
    }
  }
  return plan;
}
