/**
 * The state bridge: path resolution and bridge outcomes against
 * specs/vectors/state-path.json, the default provider through `state`, and
 * the receipt check — including every case of initial-state-coercion.json
 * replayed as the app's receipt (the driver carries the input unchanged and
 * fails exactly when the app rejects something, naming each key and reason).
 */

import * as fs from 'fs';
import * as path from 'path';
import { lookupInBridge, resolveStatePath, waitForReceipt, BridgeSnapshot } from './StateBridge';
import { JsonUITestRunner } from './JsonUITestRunner';
import { FakeBrowser } from '../__testing__/fakeBrowser';
import { INITIAL_STATE_KEY, makePayload, writeInitialState } from './InitialState';
import { ScreenTest, TestStep } from '../models/types';

const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../../test-fixtures/vectors', name), 'utf8'));

const STATE_PATH = fixture('state-path.json') as {
  data: Record<string, unknown>;
  cases: { name: string; path: string; expect: { value?: unknown; resolved?: false } }[];
  bridges: { name: string; bridge: BridgeSnapshot | null; path: string; expect: { outcome: string; value?: unknown } }[];
};

const COERCION = fixture('initial-state-coercion.json') as {
  cases: {
    name: string;
    data: { name: string; class: string }[];
    input: Record<string, unknown>;
    expect: { applied: string[]; rejected: { key: string; reason: string }[] };
  }[];
};

describe('state-path.json part 1 — resolveStatePath', () => {
  for (const c of STATE_PATH.cases) {
    it(c.name, () => {
      const got = resolveStatePath(STATE_PATH.data, c.path);
      if (c.expect.resolved === false) {
        expect(got).toEqual({ resolved: false });
      } else {
        expect(got).toEqual({ resolved: true, value: c.expect.value });
      }
    });
  }
});

describe('state-path.json part 2 — lookupInBridge', () => {
  for (const c of STATE_PATH.bridges) {
    it(c.name, () => {
      const got = lookupInBridge(c.bridge, c.path, 'login');
      expect(got.outcome).toBe(c.expect.outcome);
      if (c.expect.outcome === 'value') {
        expect(got).toEqual({ outcome: 'value', value: c.expect.value });
      }
      if (got.outcome === 'pending' && c.bridge === null) {
        expect(got.reason).toContain("window.__JSONUI_STATE__['login'] is absent");
      }
    });
  }
});

function runnerOn(browser: FakeBrowser, config = {}): JsonUITestRunner {
  return new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, ...config });
}

function stateTest(steps: TestStep[]): ScreenTest {
  return {
    type: 'screen',
    source: { layout: 'layouts/test_screen.json' },
    metadata: { name: 'state' },
    cases: [{ name: 'c', steps }]
  };
}

describe('default state provider (no harness provider)', () => {
  it('resolves `state` in the bridge data of the screen under test', async () => {
    const browser = new FakeBrowser();
    browser.win.__JSONUI_STATE__ = { test_screen: { launchId: null, initialState: null, data: { user: { name: 'N' } } } };
    const suite = await runnerOn(browser).runScreenTest(stateTest([
      { assert: 'state', path: 'user.name', equals: 'N' } as TestStep
    ]));
    expect(suite.results[0]).toMatchObject({ passed: true });
  });

  it("reads the screen under test, not another screen's bridge", async () => {
    const browser = new FakeBrowser();
    browser.win.__JSONUI_STATE__ = { other: { launchId: null, initialState: null, data: { x: 1 } } };
    const suite = await runnerOn(browser).runScreenTest(stateTest([
      { assert: 'state', path: 'x', equals: 1, timeout: 0 } as TestStep
    ]));
    expect(suite.results[0].passed).toBe(false);
    expect(suite.results[0].error).toContain("no state bridge for screen 'test_screen'");
  });

  it('a truncated bridge fails at once, without waiting out the timeout', async () => {
    const browser = new FakeBrowser();
    browser.win.__JSONUI_STATE__ = { test_screen: { truncated: 40211 } };
    const started = Date.now();
    const suite = await runnerOn(browser).runScreenTest(stateTest([
      { assert: 'state', path: 'x', equals: 1, timeout: 60000 } as TestStep
    ]));
    expect(Date.now() - started).toBeLessThan(5000);
    expect(suite.results[0].error).toContain('the iOS bridge holds up to 32 KB');
  });

  it('a harness provider wins over the bridge', async () => {
    const browser = new FakeBrowser();
    browser.win.__JSONUI_STATE__ = { test_screen: { launchId: null, initialState: null, data: { x: 1 } } };
    const runner = runnerOn(browser, { stateProvider: { getValue: async () => 2 } });
    const suite = await runner.runScreenTest(stateTest([{ assert: 'state', path: 'x', equals: 2 } as TestStep]));
    expect(suite.results[0].passed).toBe(true);
  });

  it('`when.state` reads the bridge too', async () => {
    const browser = new FakeBrowser();
    browser.win.__JSONUI_STATE__ = { test_screen: { launchId: null, initialState: null, data: { flag: true } } };
    const runner = runnerOn(browser);
    const executed: string[] = [];
    jest.spyOn((runner as any).actionExecutor, 'execute').mockImplementation(async (...a: unknown[]) => {
      executed.push(String((a[0] as TestStep).id));
    });
    await runner.runScreenTest(stateTest([
      { action: 'tap', id: 'yes', when: { state: { path: 'flag', equals: true } } } as TestStep,
      { action: 'tap', id: 'no', when: { state: { path: 'flag', equals: false } } } as TestStep
    ]));
    expect(executed).toEqual(['yes']);
  });
});

describe('waitForReceipt', () => {
  const launchId = '11111111-2222-4333-8444-555555555555';

  it('passes on a receipt for the same launch with nothing rejected', async () => {
    const browser = new FakeBrowser();
    browser.win.__JSONUI_STATE__ = { login: { launchId, initialState: { applied: ['email'], rejected: [] }, data: {} } };
    await expect(waitForReceipt(browser.page(), 'login', launchId, 0)).resolves.toEqual({ applied: ['email'], rejected: [] });
  });

  it('a receipt of another launch is not this one: no receipt', async () => {
    const browser = new FakeBrowser();
    browser.win.__JSONUI_STATE__ = { login: { launchId: 'old', initialState: { applied: [], rejected: [] }, data: {} } };
    await expect(waitForReceipt(browser.page(), 'login', launchId, 30, 10))
      .rejects.toThrow(/no receipt from the app within 30ms[\s\S]*another launch[\s\S]*NODE_ENV === 'production'/);
  });

  it('a bridge without a receipt is not a receipt', async () => {
    const browser = new FakeBrowser();
    browser.win.__JSONUI_STATE__ = { login: { launchId, initialState: null, data: {} } };
    await expect(waitForReceipt(browser.page(), 'login', launchId, 0)).rejects.toThrow(/no receipt/);
  });

  it('waits for a receipt that comes later', async () => {
    const browser = new FakeBrowser();
    setTimeout(() => {
      browser.win.__JSONUI_STATE__ = { login: { launchId, initialState: { applied: [], rejected: [] }, data: {} } };
    }, 30);
    await expect(waitForReceipt(browser.page(), 'login', launchId, 2000, 5)).resolves.toBeDefined();
  });
});

describe('initial-state-coercion.json replayed through the driver', () => {
  for (const c of COERCION.cases) {
    it(c.name, async () => {
      const browser = new FakeBrowser();
      const page = browser.page();
      const payload = makePayload({ s: c.input });
      await writeInitialState(page, payload);
      // The driver carries the input as written (2.0, null, nesting and all).
      const carried = JSON.parse(browser.win.sessionStorage.getItem(INITIAL_STATE_KEY) as string);
      expect(carried.screens.s).toEqual(c.input);
      // The app answers with the vector's verdict.
      browser.win.__JSONUI_STATE__ = {
        s: { launchId: payload.launchId, initialState: c.expect, data: {} }
      };
      const outcome = await waitForReceipt(page, 's', payload.launchId, 0).then(() => null, (e: Error) => e.message);
      if (c.expect.rejected.length === 0) {
        expect(outcome).toBeNull();
      } else {
        expect(outcome).not.toBeNull();
        for (const r of c.expect.rejected) {
          expect(outcome).toContain(`  - ${r.key}: ${r.reason}`);
        }
      }
    });
  }
});

describe('flows: receipts on arrival, state screen tracking, referenced initialState', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fakeApp } = require('../__testing__/fakeBrowser');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TestLoader } = require('./TestLoader');
  afterEach(() => jest.restoreAllMocks());

  function flowRunner(browser: FakeBrowser): JsonUITestRunner {
    const r = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false, screenReadyTimeout: 30 });
    jest.spyOn((r as any).actionExecutor, 'execute').mockImplementation(async () => undefined);
    return r;
  }

  it('checks each screen when the flow first reaches it; a screen never reached is a warning', async () => {
    const browser = new FakeBrowser('http://localhost/', ['login']);
    browser.onLoad = fakeApp('login', { email: '' });
    const suite = await flowRunner(browser).runFlowTest({
      type: 'flow',
      metadata: { name: 'f' },
      initialState: { viewModels: { login: { email: 'a' }, home: { tab: 1 } } },
      steps: [
        { screen: 'login', action: 'tap', id: 'x' },
        { screen: 'login', assert: 'state', path: 'email', equals: 'a' }
      ]
    });
    expect(suite.results[0].passed).toBe(true);
    expect(suite.results[0].warnings?.join('\n')).toContain("initialState for screen 'home' was never checked");
  });

  it('a rejected key fails the flow when it reaches that screen', async () => {
    const browser = new FakeBrowser('http://localhost/', ['login']);
    browser.onLoad = fakeApp('login', { email: '' });
    const suite = await flowRunner(browser).runFlowTest({
      type: 'flow',
      metadata: { name: 'f' },
      initialState: { viewModels: { login: { mail: 'a' } } },
      steps: [{ screen: 'login', action: 'tap', id: 'x' }]
    });
    expect(suite.results[0].passed).toBe(false);
    expect(suite.results[0].error).toContain('  - mail: not a data field');
  });

  it("`state` follows the step's screen, and a referenced case reads its own file's screen", async () => {
    const browser = new FakeBrowser('http://localhost/', ['login', 'home']);
    browser.win.__JSONUI_STATE__ = {
      login: { launchId: null, initialState: null, data: { who: 'login' } },
      home: { launchId: null, initialState: null, data: { who: 'home' } }
    };
    jest.spyOn(TestLoader, 'resolveFileReference').mockImplementation(() => ({
      type: 'screen',
      source: { layout: 'Layouts/home.json' },
      metadata: { name: 'h' },
      initialState: { viewModel: { tab: 2 } },
      cases: [{ name: 'a', steps: [{ assert: 'state', path: 'who', equals: 'home', timeout: 0 }] }]
    }));
    const suite = await flowRunner(browser).runFlowTest({
      type: 'flow',
      metadata: { name: 'f' },
      steps: [
        { screen: 'login', assert: 'state', path: 'who', equals: 'login', timeout: 0 },
        { file: 'screens/home' },
        // after the reference, back to the last screen a step named
        { assert: 'state', path: 'who', equals: 'login', timeout: 0 } as any
      ]
    });
    expect(suite.results[0].error).toBeUndefined();
    expect(suite.results[0].warnings?.join('\n')).toContain("[referenced-initial-state-ignored] the initialState of 'screens/home'");
  });
});
