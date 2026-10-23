/**
 * A flow waits for its first screen before its setup and steps, as a screen
 * test does (waitForScreenReady and 500 ms): the marker of the first step's
 * screen — an inline step's own, a referenced file's from its source.layout —
 * for screenReadyTimeout, or 'networkidle' when the first step names none.
 * Without it the first step ran on a page still drawing: in a consumer's flow
 * that began with a referenced case, text typed into a field before the
 * screen drew was wiped by the drawing (2026-10-23, drivers/web 1.17.1).
 *
 * The app here draws its first screen 40 ms after the page loads.
 */

import { JsonUITestRunner } from './JsonUITestRunner';
import { TestLoader } from './TestLoader';
import { FakeBrowser } from '../__testing__/fakeBrowser';
import { FlowTest } from '../models/types';

/** The page, with the marker drawn late, and what the first action saw. */
function setup(config: Record<string, unknown> = {}) {
  const browser = new FakeBrowser('http://localhost/', []);
  setTimeout(() => browser.markers.push('login'), 40);
  const page = browser.page();
  // FakeBrowser counts a marker once, when the locator is made; this page counts it on each look.
  jest.spyOn(page, 'locator').mockImplementation(((selector: string) => {
    const named = /^\[data-screen="(.+)"\]$/.exec(selector);
    const n = async () => (named ? (browser.markers.includes(named[1]) ? 1 : 0) : browser.markers.length);
    return {
      count: n,
      first: () => ({ isVisible: async () => (await n()) > 0 }),
      evaluateAll: async () => browser.markers.map(id => ({ id, visible: true }))
    };
  }) as any);
  const events: string[] = [];
  // A real pause (short), so the late drawing gets its turn while the runner polls; the 500 ms settle is noted.
  jest.spyOn(page, 'waitForTimeout').mockImplementation(async (ms: number) => {
    if (ms === 500) events.push('wait 500');
    await new Promise(r => setTimeout(r, Math.min(ms, 10)));
  });
  const realIdle = page.waitForLoadState.bind(page);
  jest.spyOn(page, 'waitForLoadState').mockImplementation(async (state?: any, opts?: any) => { events.push(`load ${state}`); return realIdle(state, opts); });
  const runner = new JsonUITestRunner(page, { screenshotOnFailure: false, screenReadyTimeout: 2000, ...config });
  jest.spyOn((runner as any).actionExecutor, 'execute').mockImplementation(async () => {
    events.push(browser.markers.includes('login') ? 'act on a drawn screen' : 'act before the screen drew');
  });
  return { runner, events };
}

const inlineFlow: FlowTest = {
  type: 'flow',
  metadata: { name: 'f' },
  steps: [{ screen: 'login', action: 'input', id: 'email', value: 'a@b.c' } as any]
};

describe('a flow waits for its first screen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a referenced case first: its file\'s screen marker, then 500 ms, then the case', async () => {
    jest.spyOn(TestLoader, 'resolveFileReference').mockImplementation(() => ({
      type: 'screen',
      source: { layout: 'docs/screens/layouts/login.json' },
      metadata: { name: 'login' },
      cases: [{ name: 'send', steps: [{ action: 'input', id: 'email', value: 'a@b.c' } as any] }]
    }));
    const { runner, events } = setup();
    const suite = await runner.runFlowTest({ type: 'flow', metadata: { name: 'f' }, steps: [{ file: 'login', case: 'send' }] });
    expect(suite.results[0].error).toBeUndefined();
    expect(events).toEqual(['wait 500', 'act on a drawn screen']);
  });

  it('an inline step first, with the transition check off: the marker, then 500 ms', async () => {
    const { runner, events } = setup({ verifyScreenTransitions: false });
    const suite = await runner.runFlowTest(inlineFlow);
    expect(suite.results[0].error).toBeUndefined();
    expect(events).toEqual(['wait 500', 'act on a drawn screen']);
  });

  it('an inline step first, with the transition check on: the 500 ms is there too', async () => {
    const { runner, events } = setup();
    await runner.runFlowTest(inlineFlow);
    expect(events).toEqual(['wait 500', 'act on a drawn screen']);
  });

  it('setup runs on the drawn screen too: its first step is the first screen', async () => {
    const { runner, events } = setup({ verifyScreenTransitions: false });
    await runner.runFlowTest({ ...inlineFlow, setup: [{ screen: 'login', action: 'tap', id: 'x' } as any] });
    expect(events).toEqual(['wait 500', 'act on a drawn screen', 'act on a drawn screen']);
  });

  it('a first step that names no screen: networkidle, then 500 ms', async () => {
    const { runner, events } = setup();
    await runner.runFlowTest({ type: 'flow', metadata: { name: 'f' }, steps: [{ block: 'b', steps: [{ action: 'wait', seconds: 0 } as any] } as any] });
    expect(events.slice(0, 2)).toEqual(['load networkidle', 'wait 500']);
  });

  it('a first screen that never draws fails the flow before its steps, naming the marker', async () => {
    const { runner, events } = setup({ screenReadyTimeout: 100 });
    const suite = await runner.runFlowTest({ ...inlineFlow, steps: [{ screen: 'elsewhere', action: 'tap', id: 'x' } as any] });
    expect(suite.results[0]).toMatchObject({ passed: false, failureReason: 'setup' });
    expect(suite.results[0].error).toContain("'elsewhere' marker");
    expect(events).toEqual([]);
  });
});
