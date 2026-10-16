/**
 * caseIsolation: 'shared' (default) runs setup once, every case in one page
 * state, teardown once; 'reopen' re-opens the file's starting URL before each
 * case and runs setup / teardown around each case. Fake Page — no browser.
 */

import { Page } from 'playwright';
import { JsonUITestRunner } from './JsonUITestRunner';
import { TestLoader } from './TestLoader';
import { ScreenTest, TestStep } from '../models/types';

interface Calls {
  goto: string[];
  reload: number;
  seq?: string[];
}

function makeFakePage(calls: Calls, url = 'http://localhost/screen?x=1'): Page {
  const fake = {
    viewportSize: () => ({ width: 1280, height: 800 }),
    evaluate: async () => ({ width: 0, height: 0 }),
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    screenshot: async () => Buffer.from(''),
    url: () => url,
    goto: async (target: string) => { calls.goto.push(target); calls.seq?.push('open'); return null; },
    reload: async () => { calls.reload++; return null; },
    locator: (selector: string) => {
      if (selector === '[data-screen="test_screen"]') {
        return { count: async () => 1, first: () => ({ isVisible: async () => true }) };
      }
      throw new Error(`fake page: unmodelled selector ${selector}`);
    },
    addInitScript: async () => undefined,
    context: () => ({})
  };
  return fake as unknown as Page;
}

const SETUP: TestStep[] = [{ action: 'wait', ms: 1 } as TestStep];
const TEARDOWN: TestStep[] = [{ action: 'wait', ms: 2 } as TestStep];

function screenTest(extra: Partial<ScreenTest> = {}): ScreenTest {
  return {
    type: 'screen',
    source: { layout: 'layouts/test_screen.json' },
    metadata: { name: 'IsolationTest' },
    setup: SETUP,
    teardown: TEARDOWN,
    cases: [
      { name: 'one', steps: [{ action: 'wait', ms: 10 } as TestStep] },
      { name: 'two', steps: [{ action: 'wait', ms: 20 } as TestStep] },
      { name: 'three', steps: [{ action: 'wait', ms: 30 } as TestStep] }
    ],
    ...extra
  };
}

/**
 * Records the order of goto / setup / case / teardown. executeSteps is the
 * one door every step list goes through, so the sequence is what ran.
 */
function instrument(
  runner: JsonUITestRunner,
  calls: Calls,
  failSetupOn: number[] = []
): string[] {
  const seq: string[] = [];
  let setupCount = 0;
  calls.seq = seq;
  jest.spyOn(runner as any, 'executeSteps').mockImplementation(async (...args: unknown[]) => {
    const steps = args[0] as TestStep[];
    if (steps === SETUP) {
      setupCount++;
      seq.push('setup');
      if (failSetupOn.includes(setupCount)) throw new Error(`setup boom ${setupCount}`);
      return;
    }
    if (steps === TEARDOWN) { seq.push('teardown'); return; }
    seq.push(`case:${(steps[0] as { ms: number }).ms}`);
  });
  return seq;
}

describe('caseIsolation', () => {
  it("defaults to 'shared': no re-open, setup and teardown once", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls), { screenshotOnFailure: false });
    const seq = instrument(runner, calls);
    const suite = await runner.runScreenTest(screenTest());
    expect(seq).toEqual(['setup', 'case:10', 'case:20', 'case:30', 'teardown']);
    expect(calls.goto).toEqual([]);
    expect(calls.reload).toBe(0);
    expect(suite.results.map(r => r.passed)).toEqual([true, true, true]);
  });

  it("'shared' declared explicitly is the same run", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls), { screenshotOnFailure: false });
    const seq = instrument(runner, calls);
    await runner.runScreenTest(screenTest({ caseIsolation: 'shared' }));
    expect(seq).toEqual(['setup', 'case:10', 'case:20', 'case:30', 'teardown']);
    expect(calls.goto).toEqual([]);
  });

  it("'reopen' opens the starting URL, then setup, case, teardown — once per case", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls), { screenshotOnFailure: false });
    const seq = instrument(runner, calls);
    const suite = await runner.runScreenTest(screenTest({ caseIsolation: 'reopen' }));
    expect(seq).toEqual([
      'open', 'setup', 'case:10', 'teardown',
      'open', 'setup', 'case:20', 'teardown',
      'open', 'setup', 'case:30', 'teardown'
    ]);
    expect(calls.goto).toEqual(Array(3).fill('http://localhost/screen?x=1'));
    expect(suite.results.map(r => [r.caseName, r.passed])).toEqual([
      ['one', true], ['two', true], ['three', true]
    ]);
  });

  it("'reopen' fails only the case whose setup failed, still runs its teardown", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls), { screenshotOnFailure: false });
    const seq = instrument(runner, calls, [2]);
    const suite = await runner.runScreenTest(screenTest({ caseIsolation: 'reopen' }));
    expect(seq).toEqual([
      'open', 'setup', 'case:10', 'teardown',
      'open', 'setup', 'teardown',
      'open', 'setup', 'case:30', 'teardown'
    ]);
    expect(suite.results).toHaveLength(3);
    expect(suite.results[1]).toMatchObject({
      caseName: 'two', passed: false, failureReason: 'setup', error: 'setup failed: setup boom 2'
    });
    expect(suite.results[0].passed).toBe(true);
    expect(suite.results[2].passed).toBe(true);
  });

  it("'shared' setup failure still fails every case and runs teardown once (unchanged)", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls), { screenshotOnFailure: false });
    const seq = instrument(runner, calls, [1]);
    const suite = await runner.runScreenTest(screenTest());
    expect(seq).toEqual(['setup', 'teardown']);
    expect(suite.results.map(r => r.failureReason)).toEqual(['setup', 'setup', 'setup']);
  });

  it("'reopen' does not open anything for a skipped case", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls), { screenshotOnFailure: false });
    const seq = instrument(runner, calls);
    const test = screenTest({ caseIsolation: 'reopen' });
    test.cases[1] = { ...test.cases[1], skip: true };
    const suite = await runner.runScreenTest(test);
    expect(seq).toEqual([
      'open', 'setup', 'case:10', 'teardown',
      'open', 'setup', 'case:30', 'teardown'
    ]);
    expect(suite.results[1]).toMatchObject({ caseName: 'two', skipped: true });
  });

  it("'reopen' re-opens on every retry attempt", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls),
      { screenshotOnFailure: false, caseRetries: 1 });
    const seq = instrument(runner, calls, [1]);
    const test = screenTest({ caseIsolation: 'reopen' });
    test.cases = [test.cases[0]];
    const suite = await runner.runScreenTest(test);
    expect(seq).toEqual(['open', 'setup', 'teardown', 'open', 'setup', 'case:10', 'teardown']);
    expect(suite.results[0]).toMatchObject({ passed: true, attempts: 2 });
  });

  it("'reopen' re-applies the file's mock scenarios before each open", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls), { screenshotOnFailure: false });
    const scenarioSet = jest.fn(async () => undefined);
    (runner as any).mockClient = { scenarioSet, reset: async () => undefined };
    instrument(runner, calls);
    await runner.runScreenTest(screenTest({ caseIsolation: 'reopen', mocks: { getItems: 'empty' } }));
    expect(scenarioSet).toHaveBeenCalledTimes(3);
    expect(calls.reload).toBe(0);
  });

  it("'reopen' on a page that never navigated fails each case as setup, naming why", async () => {
    const calls: Calls = { goto: [], reload: 0 };
    const runner = new JsonUITestRunner(makeFakePage(calls, 'about:blank'), { screenshotOnFailure: false });
    const seq = instrument(runner, calls);
    const suite = await runner.runScreenTest(screenTest({ caseIsolation: 'reopen' }));
    expect(seq).toEqual(['teardown', 'teardown', 'teardown']);
    expect(suite.results.every(r => r.failureReason === 'setup')).toBe(true);
    expect(suite.results[0].error).toContain("caseIsolation 'reopen'");
  });
});

describe('TestLoader caseIsolation', () => {
  const write = (body: object): string => JSON.stringify(body);
  const base = {
    type: 'screen', source: { layout: 'a' }, metadata: { name: 'x' },
    cases: [{ name: 'c', steps: [{ action: 'wait', ms: 1 }] }]
  };

  it('accepts shared and reopen', () => {
    for (const v of ['shared', 'reopen']) {
      const loaded = TestLoader.loadFromString(write({ ...base, caseIsolation: v }));
      expect(loaded.type === 'screen' && loaded.test.caseIsolation).toBe(v);
    }
  });

  it('rejects a misspelt value instead of running it as shared', () => {
    expect(() => TestLoader.loadFromString(write({ ...base, caseIsolation: 'reOpen' })))
      .toThrow(/unknown caseIsolation/);
  });
});

describe('caseIsolation × initialState', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { FakeBrowser, fakeApp } = require('../__testing__/fakeBrowser');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { INITIAL_STATE_KEY } = require('./InitialState');

  afterEach(() => jest.restoreAllMocks());

  function caseTest(extra: Partial<ScreenTest>): ScreenTest {
    return {
      type: 'screen',
      source: { layout: 'layouts/test_screen.json' },
      metadata: { name: 'iso' },
      initialState: { viewModel: { email: 'file', password: 'p' } },
      cases: [
        { name: 'a', steps: [{ assert: 'state', path: 'email', equals: 'file' } as TestStep] },
        {
          name: 'b',
          initialState: { viewModel: { email: 'case-b' } },
          steps: [{ assert: 'state', path: 'email', equals: 'case-b' } as TestStep]
        }
      ],
      ...extra
    };
  }

  it("'reopen' delivers file ⊕ case per case, each with a fresh launchId, by goto", async () => {
    const browser = new FakeBrowser('http://localhost/screen?x=1');
    const payloads: { launchId: string; screens: Record<string, unknown> }[] = [];
    const app = fakeApp('test_screen', { email: '', password: '' });
    browser.onLoad = (win: any) => {
      payloads.push(JSON.parse(win.sessionStorage.getItem(INITIAL_STATE_KEY)));
      app(win);
    };
    const runner = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 50 });
    const suite = await runner.runScreenTest(caseTest({ caseIsolation: 'reopen' }));
    expect(suite.results.map(r => [r.caseName, r.passed, r.error])).toEqual([
      ['a', true, undefined], ['b', true, undefined]
    ]);
    expect(payloads.map(p => p.screens)).toEqual([
      { test_screen: { email: 'file', password: 'p' } },
      { test_screen: { email: 'case-b', password: 'p' } }
    ]);
    expect(payloads[0].launchId).not.toEqual(payloads[1].launchId);
    expect(browser.log.filter((e: string) => e.startsWith('goto:'))).toHaveLength(2);
    expect(browser.log).not.toContain('reload');
  });

  it("'reopen': a case whose receipt does not come fails as setup, the others still run", async () => {
    const browser = new FakeBrowser('http://localhost/screen');
    let n = 0;
    const ok = fakeApp('test_screen', { email: '', password: '' });
    const closed = fakeApp('test_screen', { email: '', password: '' }, { gateClosed: true });
    browser.onLoad = (win: any) => { n++; (n === 1 ? closed : ok)(win); };
    const runner = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 30 });
    const suite = await runner.runScreenTest(caseTest({ caseIsolation: 'reopen' }));
    expect(suite.results[0]).toMatchObject({ caseName: 'a', passed: false, failureReason: 'setup' });
    expect(suite.results[0].error).toContain('no receipt');
    expect(suite.results[1]).toMatchObject({ caseName: 'b', passed: true });
  });

  it("'shared': a case-level initialState fails that case only, the file payload still goes", async () => {
    const browser = new FakeBrowser('http://localhost/screen');
    browser.onLoad = fakeApp('test_screen', { email: '', password: '' });
    const runner = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 50 });
    const suite = await runner.runScreenTest(caseTest({}));
    expect(suite.results[0]).toMatchObject({ caseName: 'a', passed: true });
    expect(suite.results[1]).toMatchObject({ caseName: 'b', passed: false, failureReason: 'setup' });
    expect(suite.results[1].error).toMatch(/^\[case-initial-state-needs-reopen\]/);
    expect(browser.log.filter((e: string) => e === 'reload')).toHaveLength(1);
  });
});
