/**
 * The runner applies `launch` (spec §5, §10.2): clearState, permissions,
 * arguments, initialState, mocks, then one reload — on a fake page whose log
 * records every effect in order.
 */

import { JsonUITestRunner } from './JsonUITestRunner';
import { applyLaunchToPage, clearTestStorage, ARGS_KEY } from './LaunchConfig';
import { INITIAL_STATE_KEY } from './InitialState';
import { FakeBrowser, fakeApp } from '../__testing__/fakeBrowser';
import { ScreenTest, TestStep, LaunchConfig } from '../models/types';

function screenTest(extra: Partial<ScreenTest> = {}): ScreenTest {
  return {
    type: 'screen',
    source: { layout: 'layouts/test_screen.json' },
    metadata: { name: 'launch' },
    cases: [{ name: 'c', steps: [{ action: 'wait', ms: 1 } as TestStep] }],
    ...extra
  };
}

function runner(browser: FakeBrowser, mockLog?: string[]): JsonUITestRunner {
  const r = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 50 });
  (r as any).mockClient = {
    scenarioSet: async () => { (mockLog ?? browser.log).push('scenarioSet'); },
    reset: async () => undefined
  };
  jest.spyOn(r as any, 'executeSteps').mockImplementation(async () => undefined);
  return r;
}

const FULL_LAUNCH: LaunchConfig = {
  clearState: true,
  permissions: { camera: 'allow', location: 'deny' },
  arguments: { apiBase: 'http://x', mockApi: true }
};

describe('launch applied by the runner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('runs the steps in the contract order and reloads exactly once', async () => {
    const browser = new FakeBrowser();
    browser.onLoad = fakeApp('test_screen', { email: '' });
    const suite = await runner(browser).runScreenTest(screenTest({
      launch: FULL_LAUNCH,
      mocks: { getItems: 'empty' },
      initialState: { viewModel: { email: 'a@example.com' } }
    }));
    expect(suite.results[0].passed).toBe(true);
    const upToReload = browser.log.slice(0, browser.log.indexOf('reload') + 1);
    expect(upToReload).toEqual([
      'clearCookies',
      'local.clear',
      'session.clear',
      'clearPermissions',
      'grant:camera@http://localhost',
      `session.set:${ARGS_KEY}`,
      `session.set:${INITIAL_STATE_KEY}`,
      'scenarioSet',
      'reload'
    ]);
    expect(browser.log.filter(e => e === 'reload')).toHaveLength(1);
  });

  it('arguments land in sessionStorage as JSON and are gone after the file', async () => {
    const browser = new FakeBrowser();
    let seen: string | null = null;
    browser.onLoad = (win) => { seen = win.sessionStorage.getItem(ARGS_KEY); };
    await runner(browser).runScreenTest(screenTest({ launch: { arguments: { apiBase: 'http://x', n: 2 } } }));
    expect(JSON.parse(seen as unknown as string)).toEqual({ apiBase: 'http://x', n: 2 });
    expect(browser.win.sessionStorage.getItem(ARGS_KEY)).toBeNull();
    expect(browser.win.sessionStorage.getItem(INITIAL_STATE_KEY)).toBeNull();
  });

  it('a file without launch, mocks or initialState does not reload', async () => {
    const browser = new FakeBrowser();
    await runner(browser).runScreenTest(screenTest());
    expect(browser.log).not.toContain('reload');
    expect(browser.log).not.toContain('clearCookies');
  });

  it('a deny clears an earlier file\'s allow (decision 12)', async () => {
    const browser = new FakeBrowser();
    const r = runner(browser);
    await r.runScreenTest(screenTest({ launch: { permissions: { camera: 'allow' } } }));
    browser.log.length = 0;
    await r.runScreenTest(screenTest({ launch: { permissions: { camera: 'deny', microphone: 'allow' } } }));
    expect(browser.log.slice(0, 2)).toEqual(['clearPermissions', 'grant:microphone@http://localhost']);
  });

  it('an allow-only launch does not clear (nothing to take back)', async () => {
    const browser = new FakeBrowser();
    await runner(browser).runScreenTest(screenTest({ launch: { permissions: { camera: 'allow' } } }));
    expect(browser.log).not.toContain('clearPermissions');
  });

  it('unset clears too', async () => {
    const browser = new FakeBrowser();
    await runner(browser).runScreenTest(screenTest({ launch: { permissions: { notifications: 'unset' } } }));
    expect(browser.log[0]).toBe('clearPermissions');
  });

  it('on about:blank the launch fails every case as setup (teardown still runs)', async () => {
    const browser = new FakeBrowser('about:blank');
    const r = runner(browser);
    const test = screenTest({ launch: { clearState: true }, teardown: [{ action: 'wait', ms: 2 } as TestStep] });
    test.cases.push({ name: 'd', steps: [] });
    const suite = await r.runScreenTest(test);
    expect(suite.results.map(x => [x.caseName, x.passed, x.failureReason])).toEqual([
      ['c', false, 'setup'], ['d', false, 'setup']
    ]);
    expect(suite.results[0].error).toMatch(/^launch failed: launch is applied on the page under test, and the page is on 'about:blank'/);
  });

  it('a mocks failure fails every case instead of escaping the file', async () => {
    const browser = new FakeBrowser();
    const r = runner(browser);
    (r as any).mockClient.scenarioSet = async () => { throw new Error('mock scenario-set: unknown operationId(s): nope'); };
    const suite = await r.runScreenTest(screenTest({ mocks: { nope: 'x' } }));
    expect(suite.results[0]).toMatchObject({ passed: false, failureReason: 'setup' });
    expect(suite.results[0].error).toContain('unknown operationId');
  });

  it('applyLaunchToPage refuses a blank page', async () => {
    const browser = new FakeBrowser('about:blank');
    await expect(applyLaunchToPage(browser.page(), {})).rejects.toThrow(/about:blank/);
  });

  it('clearTestStorage removes only the two runner keys', async () => {
    const browser = new FakeBrowser();
    browser.win.sessionStorage.setItem(ARGS_KEY, '{}');
    browser.win.sessionStorage.setItem(INITIAL_STATE_KEY, '{}');
    browser.win.sessionStorage.setItem('app', 'keep');
    await clearTestStorage(browser.page());
    expect(browser.win.sessionStorage.keys()).toEqual(['app']);
  });
});

describe('initialState receipt in a screen test', () => {
  afterEach(() => jest.restoreAllMocks());

  it('an app that never confirms fails every case as setup, naming the causes', async () => {
    const browser = new FakeBrowser();
    browser.onLoad = fakeApp('test_screen', { email: '' }, { gateClosed: true });
    const suite = await runner(browser).runScreenTest(screenTest({ initialState: { viewModel: { email: 'a' } } }));
    expect(suite.results[0]).toMatchObject({ passed: false, failureReason: 'setup' });
    expect(suite.results[0].error).toContain('no receipt from the app');
    expect(suite.results[0].error).toContain("NODE_ENV === 'production'");
  });

  it('an unknown key fails with the app\'s reason', async () => {
    const browser = new FakeBrowser();
    browser.onLoad = fakeApp('test_screen', { email: '' });
    const suite = await runner(browser).runScreenTest(screenTest({ initialState: { viewModel: { email: 'a', nickname: 'x' } } }));
    expect(suite.results[0]).toMatchObject({ passed: false, failureReason: 'setup' });
    expect(suite.results[0].error).toContain('  - nickname: not a data field');
  });

  it('values applied are readable through `state`', async () => {
    const browser = new FakeBrowser();
    browser.onLoad = fakeApp('test_screen', { email: '', count: 0 });
    const r = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 50 });
    const suite = await r.runScreenTest(screenTest({
      initialState: { viewModel: { email: 'a@example.com', count: 3 } },
      cases: [{ name: 'c', steps: [
        { assert: 'state', path: 'email', equals: 'a@example.com' } as TestStep,
        { assert: 'state', path: 'count', equals: 3 } as TestStep
      ] }]
    }));
    expect(suite.results[0]).toMatchObject({ passed: true });
  });
});

describe('afterLaunch (harness hook)', () => {
  afterEach(() => jest.restoreAllMocks());

  function hooked(browser: FakeBrowser, hook: (page: unknown) => void | Promise<void>): JsonUITestRunner {
    const r = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 50, afterLaunch: hook });
    (r as any).mockClient = { scenarioSet: async () => { browser.log.push('scenarioSet'); }, reset: async () => undefined };
    jest.spyOn(r as any, 'executeSteps').mockImplementation(async () => undefined);
    return r;
  }

  it('runs after clearState / permissions / arguments and before the payload, the mocks and the reload', async () => {
    const browser = new FakeBrowser();
    browser.onLoad = fakeApp('test_screen', { email: '' });
    const suite = await hooked(browser, async () => { browser.log.push('afterLaunch'); }).runScreenTest(screenTest({
      launch: FULL_LAUNCH, mocks: { getItems: 'empty' }, initialState: { viewModel: { email: 'a' } }
    }));
    expect(suite.results[0].passed).toBe(true);
    expect(browser.log.slice(0, browser.log.indexOf('reload') + 1)).toEqual([
      'clearCookies', 'local.clear', 'session.clear', 'clearPermissions', 'grant:camera@http://localhost',
      `session.set:${ARGS_KEY}`, 'afterLaunch', `session.set:${INITIAL_STATE_KEY}`, 'scenarioSet', 'reload'
    ]);
  });

  it('a cookie it seeds survives to the launched document (clearState came first)', async () => {
    const browser = new FakeBrowser();
    const jar: string[] = [];
    browser.log.push = new Proxy(browser.log.push, {
      apply: (target, self, args) => { if (args[0] === 'clearCookies') jar.length = 0; return Reflect.apply(target, self, args); }
    });
    let atLoad: string[] = [];
    browser.onLoad = () => { atLoad = [...jar]; };
    await hooked(browser, () => { jar.push('session=abc'); }).runScreenTest(screenTest({ launch: { clearState: true } }));
    expect(atLoad).toEqual(['session=abc']);
  });

  it('runs once per launch: per case under reopen, each before that case\'s goto', async () => {
    const browser = new FakeBrowser();
    browser.onLoad = fakeApp('test_screen', { email: '' });
    const test = screenTest({ caseIsolation: 'reopen', launch: { clearState: true } });
    test.cases.push({ name: 'd', steps: [] });
    await hooked(browser, () => { browser.log.push('afterLaunch'); }).runScreenTest(test);
    const order = browser.log.filter(e => e === 'afterLaunch' || e.startsWith('goto:'));
    expect(order).toEqual(['afterLaunch', 'goto:http://localhost/screen', 'afterLaunch', 'goto:http://localhost/screen']);
  });

  it('a throw fails the cases as setup, like any launch step', async () => {
    const browser = new FakeBrowser();
    const suite = await hooked(browser, async () => { throw new Error('seed failed'); })
      .runScreenTest(screenTest({ launch: { clearState: true } }));
    expect(suite.results[0]).toMatchObject({ passed: false, failureReason: 'setup' });
    expect(suite.results[0].error).toContain('launch failed: seed failed');
    expect(browser.log).not.toContain('reload');
  });

  it('is not called when the file has nothing to launch with', async () => {
    const browser = new FakeBrowser();
    const hook = jest.fn();
    await hooked(browser, hook).runScreenTest(screenTest());
    expect(hook).not.toHaveBeenCalled();
  });

  it('runs in a flow launch too', async () => {
    const browser = new FakeBrowser('http://localhost/', ['test_screen']);
    const hook = jest.fn();
    const r = hooked(browser, hook);
    jest.spyOn((r as any).actionExecutor, 'execute').mockImplementation(async () => undefined);
    await r.runFlowTest({ type: 'flow', metadata: { name: 'f' }, launch: { clearState: true }, steps: [] });
    expect(hook).toHaveBeenCalledTimes(1);
  });
});

describe('payload writtenAt (web)', () => {
  it('stamps the payload with the page clock at the moment it is written', async () => {
    const browser = new FakeBrowser();
    browser.onLoad = fakeApp('test_screen', { email: '' });
    let seen: { writtenAt?: number } | null = null;
    const app = browser.onLoad;
    browser.onLoad = (win) => { seen = JSON.parse(win.sessionStorage.getItem(INITIAL_STATE_KEY) as string); app(win); };
    const before = Date.now();
    await runner(browser).runScreenTest(screenTest({ initialState: { viewModel: { email: 'a' } } }));
    const after = Date.now();
    expect(typeof seen!.writtenAt).toBe('number');
    expect(seen!.writtenAt!).toBeGreaterThanOrEqual(before);
    expect(seen!.writtenAt!).toBeLessThanOrEqual(after);
  });
});
