/**
 * initialState payloads against specs/vectors/initial-state-payload.json —
 * twice: the plan (planLaunches, pure) and the runner itself on a fake page
 * whose app records the payload each load carries.
 *
 * The vectors are copied into test-fixtures/vectors/ and held byte-equal to
 * the jsonui-test-runner specs (vectors.test.ts).
 */

import * as fs from 'fs';
import * as path from 'path';
import { JsonUITestRunner } from './JsonUITestRunner';
import { TestLoader } from './TestLoader';
import { screenIdFromLayout } from './screenIdentity';
import { planLaunches, INITIAL_STATE_KEY, InitialStateScreens } from './InitialState';
import { FakeBrowser, FakeWindow } from '../__testing__/fakeBrowser';
import { FlowTest, ScreenTest } from '../models/types';

interface VectorCase {
  name: string;
  test: ScreenTest | FlowTest;
  files?: Record<string, ScreenTest>;
  expect: {
    launches: { before: string; screens: InitialStateScreens | null }[];
    caseFailures: { case: string; failureReason: string; code: string }[];
    warnings: { code: string; file?: string; case?: string }[];
    validateErrors: unknown[];
  };
}

const VECTOR = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../test-fixtures/vectors/initial-state-payload.json'), 'utf8')
) as { cases: VectorCase[] };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('initial-state-payload.json — the plan', () => {
  it('has cases', () => {
    expect(VECTOR.cases.length).toBeGreaterThanOrEqual(19);
  });

  for (const c of VECTOR.cases) {
    it(c.name, () => {
      const files = c.files ?? {};
      const plan = planLaunches(clone(c.test), ref => {
        if (!files[ref]) throw new Error(`vector has no file ${ref}`);
        return clone(files[ref]);
      });
      expect(plan.launches).toEqual(c.expect.launches);
      expect(plan.caseFailures).toEqual(c.expect.caseFailures);
      expect(plan.warnings).toEqual(c.expect.warnings);
    });
  }
});

/** The app accepts every key of every screen in the payload and publishes the receipt. */
function acceptAll(loads: (InitialStateScreens | null)[]): (win: FakeWindow) => void {
  return (win) => {
    const raw = win.sessionStorage.getItem(INITIAL_STATE_KEY);
    if (!raw) { loads.push(null); return; }
    const payload = JSON.parse(raw) as { version: number; launchId: string; screens: InitialStateScreens };
    expect(payload.version).toBe(1);
    expect(payload.launchId).toMatch(/^[0-9a-f-]{36}$/);
    loads.push(clone(payload.screens));
    const state: Record<string, unknown> = {};
    for (const [screen, values] of Object.entries(payload.screens)) {
      state[screen] = {
        launchId: payload.launchId,
        initialState: { applied: Object.keys(values), rejected: [] },
        data: values
      };
    }
    win.__JSONUI_STATE__ = state;
  };
}

describe('initial-state-payload.json — the runner', () => {
  afterEach(() => jest.restoreAllMocks());

  for (const c of VECTOR.cases) {
    it(c.name, async () => {
      const test = clone(c.test);
      const screens = test.type === 'screen'
        ? [screenIdFromLayout(test.source.layout)]
        : (test.sources ?? []).map(s => screenIdFromLayout(s.layout));
      const markers = screens.filter((s): s is string => s !== null);
      const browser = new FakeBrowser('http://localhost/app', markers);
      const loads: (InitialStateScreens | null)[] = [];
      browser.onLoad = acceptAll(loads);
      const runner = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 50 });
      (runner as any).mockClient = { scenarioSet: async () => undefined, reset: async () => undefined };
      jest.spyOn(runner as any, 'executeSteps').mockImplementation(async () => undefined);
      jest.spyOn(runner as any, 'executeStepGuarded').mockImplementation(async () => undefined);
      const files = c.files ?? {};
      jest.spyOn(TestLoader, 'resolveFileReference').mockImplementation((ref: string) => clone(files[ref]));

      const suite = test.type === 'screen' ? await runner.runScreenTest(test) : await runner.runFlowTest(test);

      expect(loads).toEqual(c.expect.launches.map(l => l.screens));
      const failures = suite.results
        .filter(r => r.error?.startsWith('[case-initial-state-needs-reopen]'))
        .map(r => ({ case: r.caseName, failureReason: r.failureReason, code: 'case-initial-state-needs-reopen' }));
      expect(failures).toEqual(c.expect.caseFailures);
      const coded = suite.results.flatMap(r => r.warnings ?? []).filter(w => w.startsWith('[referenced-initial-state-ignored]'));
      expect(coded).toHaveLength(c.expect.warnings.length);
      for (const w of c.expect.warnings) {
        const what = w.case !== undefined ? `case '${w.case}' of '${w.file}'` : `'${w.file}'`;
        expect(coded.some(m => m.includes(`initialState of ${what} `))).toBe(true);
      }
      // Every case that ran passed: the receipts all came.
      const others = suite.results.filter(r => !r.skipped && !r.error?.startsWith('[case-initial-state-needs-reopen]'));
      expect(others.filter(r => !r.passed).map(r => r.error)).toEqual([]);
    });
  }
});
