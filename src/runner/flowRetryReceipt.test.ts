/**
 * A flow screen leaves the pending-receipt set only once its receipt passed
 * (spec §10.5), so a retried flow body checks it again — which needs the
 * attempt to start on no known screen: otherwise its first step returns early
 * as "same screen" (trackedScreen still names the screen the failed attempt
 * reached) and the check is skipped. The same holds across flow files.
 */

import { JsonUITestRunner } from './JsonUITestRunner';
import * as StateBridge from './StateBridge';
import { FakeBrowser } from '../__testing__/fakeBrowser';
import { FlowTest } from '../models/types';

const flow = (viewModels: Record<string, Record<string, unknown>>): FlowTest => ({
  type: 'flow',
  metadata: { name: 'f' },
  initialState: { viewModels },
  steps: [{ screen: 'login', action: 'tap', id: 'x' }]
});

/** The app that confirms whatever payload the page holds, for `login`. */
function confirm(browser: FakeBrowser): void {
  const raw = browser.win.sessionStorage.getItem('JSONUI_TEST_INITIAL_STATE');
  const payload = JSON.parse(raw as string);
  browser.win.__JSONUI_STATE__ = {
    login: { launchId: payload.launchId, initialState: { applied: Object.keys(payload.screens.login), rejected: [] }, data: {} }
  };
}

describe('flow receipts on a retried body', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a receipt that failed on attempt 1 is checked again on attempt 2', async () => {
    const browser = new FakeBrowser('http://localhost/', ['login']);
    const runner = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 20, caseRetries: 1 });
    jest.spyOn((runner as any).actionExecutor, 'execute').mockImplementation(async () => undefined);
    const real = StateBridge.waitForReceipt;
    const waits: string[] = [];
    jest.spyOn(StateBridge, 'waitForReceipt').mockImplementation(async (...args) => {
      try {
        const receipt = await real(...args);
        waits.push('passed');
        return receipt;
      } catch (e) {
        waits.push('failed');
        confirm(browser); // the app confirms late: attempt 2 can see it
        throw e;
      }
    });

    const suite = await runner.runFlowTest(flow({ login: { email: 'a' } }));

    expect(waits).toEqual(['failed', 'passed']);
    expect(suite.results[0]).toMatchObject({ passed: true, attempts: 2 });
  });

  it('a second flow file starting on the screen the first ended on still checks its receipt', async () => {
    const browser = new FakeBrowser('http://localhost/', ['login']);
    browser.onLoad = () => confirm(browser);
    const runner = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 20 });
    jest.spyOn((runner as any).actionExecutor, 'execute').mockImplementation(async () => undefined);
    const spy = jest.spyOn(StateBridge, 'waitForReceipt');

    await runner.runFlowTest(flow({ login: { email: 'a' } }));
    const second = await runner.runFlowTest(flow({ login: { email: 'b' } }));

    expect(spy).toHaveBeenCalledTimes(2);
    expect(second.results[0].passed).toBe(true);
    expect(second.results[0].warnings ?? []).toEqual([]);
  });
});

describe('after a file-reference step', () => {
  afterEach(() => jest.restoreAllMocks());

  it('the next inline step is verified again (trackedScreen is unknown) and `state` reads the last named screen', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TestLoader } = require('./TestLoader');
    const browser = new FakeBrowser('http://localhost/', ['login', 'home']);
    browser.win.__JSONUI_STATE__ = {
      login: { launchId: null, initialState: null, data: { who: 'login' } },
      home: { launchId: null, initialState: null, data: { who: 'home' } }
    };
    jest.spyOn(TestLoader, 'resolveFileReference').mockImplementation(() => ({
      type: 'screen', source: { layout: 'Layouts/home.json' }, metadata: { name: 'h' },
      cases: [{ name: 'a', steps: [{ assert: 'state', path: 'who', equals: 'home', timeout: 0 }] }]
    }));
    const runner = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false });
    const screens: string[] = [];
    const assertions = (runner as any).assertionExecutor;
    const original = assertions.execute.bind(assertions);
    jest.spyOn(assertions, 'execute').mockImplementation(async (...a: unknown[]) => {
      const step = a[0] as { assert?: string; name?: string };
      if (step.assert === 'screen') screens.push(String(step.name));
      return original(...a);
    });
    const suite = await runner.runFlowTest({
      type: 'flow', metadata: { name: 'f' },
      steps: [
        { screen: 'login', assert: 'state', path: 'who', equals: 'login', timeout: 0 },
        { file: 'screens/home' },
        { screen: 'login', assert: 'state', path: 'who', equals: 'login', timeout: 0 }
      ]
    });
    expect(suite.results[0].error).toBeUndefined();
    // login verified on arrival, and again after the reference (it may have ended anywhere)
    expect(screens).toEqual(['login', 'login']);
  });
});
