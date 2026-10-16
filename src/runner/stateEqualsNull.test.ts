/**
 * `equals: null` is a value: `state` asserts that the path holds null. Pinned
 * through the real loader (TestLoader.loadFromString — JSON is the only test
 * file format this driver reads) into the runner and its AssertionExecutor,
 * on every path a step reaches it: a screen-test case, a case with args
 * (load-time substitution), runtime variables (readText substitution), a flow
 * inline step, a flow block step, and `when.state`. The iOS and Android
 * drivers read a JSON null there as "no equals" ("state requires 'equals'").
 */

import { JsonUITestRunner } from './JsonUITestRunner';
import { TestLoader } from './TestLoader';
import { FakeBrowser } from '../__testing__/fakeBrowser';
import { FlowTest, ScreenTest } from '../models/types';

function browserWith(nickname: unknown): FakeBrowser {
  const browser = new FakeBrowser('http://localhost/', ['test_screen']);
  browser.win.__JSONUI_STATE__ = {
    test_screen: { launchId: null, initialState: null, data: { nickname, tag: 'T' } }
  };
  return browser;
}

function runner(browser: FakeBrowser): JsonUITestRunner {
  const r = new JsonUITestRunner(browser.page(), { screenshotOnFailure: false });
  jest.spyOn((r as any).actionExecutor, 'execute').mockImplementation(async () => undefined);
  return r;
}

const screenFile = (caseExtra: object = {}) => `{
  "type": "screen",
  "source": { "layout": "layouts/test_screen.json" },
  "metadata": { "name": "null" },
  "cases": [{ "name": "c", ${Object.keys(caseExtra).length ? JSON.stringify(caseExtra).slice(1, -1) + ',' : ''}
    "steps": [{ "assert": "state", "path": "nickname", "equals": null, "timeout": 0 }] }]
}`;

const loadScreen = (json: string): ScreenTest => {
  const loaded = TestLoader.loadFromString(json);
  if (loaded.type !== 'screen') throw new Error('not a screen test');
  return loaded.test;
};
const loadFlow = (json: string): FlowTest => {
  const loaded = TestLoader.loadFromString(json);
  if (loaded.type !== 'flow') throw new Error('not a flow test');
  return loaded.test;
};

describe("state with equals: null, through the loader", () => {
  afterEach(() => jest.restoreAllMocks());

  it('the loaded step keeps equals as null (not undefined, not dropped)', () => {
    const step = loadScreen(screenFile()).cases[0].steps[0];
    expect('equals' in step).toBe(true);
    expect(step.equals).toBeNull();
  });

  it('a screen-test case passes when the path holds null', async () => {
    const suite = await runner(browserWith(null)).runScreenTest(loadScreen(screenFile()));
    expect(suite.results[0]).toMatchObject({ passed: true });
  });

  it('and fails, as an assertion on the value, when it does not', async () => {
    const suite = await runner(browserWith('x')).runScreenTest(loadScreen(screenFile()));
    expect(suite.results[0].passed).toBe(false);
    expect(suite.results[0].error).toContain(`State 'nickname' should be null but got "x"`);
    expect(suite.results[0].error).not.toContain("requires 'equals'");
  });

  it('a case with args (load-time substitution) keeps the null', async () => {
    const test = loadScreen(screenFile({ args: { who: 'n' } }));
    const suite = await runner(browserWith(null)).runScreenTest(test);
    expect(suite.results[0]).toMatchObject({ passed: true });
  });

  it('runtime variables (readText substitution) keep the null', async () => {
    const r = runner(browserWith(null));
    (r as any).variables.seen = 'v';
    const suite = await r.runScreenTest(loadScreen(screenFile()));
    expect(suite.results[0]).toMatchObject({ passed: true });
  });

  it('a flow inline step and a block step keep the null', async () => {
    const flow = loadFlow(`{
      "type": "flow", "metadata": { "name": "f" },
      "steps": [
        { "screen": "test_screen", "assert": "state", "path": "nickname", "equals": null, "timeout": 0 },
        { "block": "b", "steps": [{ "assert": "state", "path": "nickname", "equals": null, "timeout": 0 }] }
      ]
    }`);
    const suite = await runner(browserWith(null)).runFlowTest(flow);
    expect(suite.results[0].error).toBeUndefined();
    expect(suite.results[0].passed).toBe(true);
    const red = await runner(browserWith('x')).runFlowTest(flow);
    expect(red.results[0].error).toContain('should be null');
  });

  it('when.state with equals: null is met only by a null', async () => {
    const json = (value: string) => `{
      "type": "screen", "source": { "layout": "layouts/test_screen.json" }, "metadata": { "name": "w" },
      "cases": [{ "name": "c", "steps": [
        { "when": { "state": { "path": "nickname", "equals": null } },
          "assert": "state", "path": "tag", "equals": ${value}, "timeout": 0 }
      ] }]
    }`;
    // met: the guarded assertion runs (and fails on purpose)
    const met = await runner(browserWith(null)).runScreenTest(loadScreen(json('"nope"')));
    expect(met.results[0].error).toContain(`State 'tag' should be "nope"`);
    // not met: the guarded assertion is skipped
    const unmet = await runner(browserWith('x')).runScreenTest(loadScreen(json('"nope"')));
    expect(unmet.results[0].passed).toBe(true);
  });
});
