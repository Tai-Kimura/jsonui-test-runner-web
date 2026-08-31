/**
 * Unit tests for responsive gating, fail-safe condition skips and skipReason
 * emission (fake Page — no browser)
 */

import { Page } from 'playwright';
import { JsonUITestRunner, TestRunnerConfig } from './JsonUITestRunner';
import { ResultsWriter } from './ResultsWriter';
import { FlowTest, ScreenTest, TestCase, WhenCondition } from '../models/types';

interface FakePageOptions {
  /** `data-screen` values present on the page. Default: the one the fixture test declares. */
  markers?: string[];
  /** Whether a present marker reports itself visible. */
  markerVisible?: boolean;
  /** Records every `waitForLoadState` argument, so a test can prove the gate was NOT used. */
  loadStates?: string[];
}

/**
 * The readiness gate reads the DOM, so the fake has to model it — and model
 * it strictly. An unmodelled selector THROWS rather than returning an empty
 * locator: a fake that answers "nothing matched" to a question it does not
 * understand cannot express the failure this gate exists to produce, and
 * every marker test would pass for the wrong reason.
 */
function makeFakePage(
  viewport: { width: number; height: number } | null,
  options: FakePageOptions = {}
): Page {
  const markers = options.markers ?? ['test_screen'];
  const fake = {
    viewportSize: () => viewport,
    evaluate: async () => ({ width: 0, height: 0 }),
    waitForLoadState: async (state?: string) => {
      options.loadStates?.push(state ?? 'load');
    },
    waitForTimeout: async () => undefined,
    screenshot: async () => Buffer.from(''),
    url: () => 'http://localhost/fake',
    locator: (selector: string) => {
      const named = /^\[data-screen="(.+)"\]$/.exec(selector);
      if (named) {
        const present = markers.includes(named[1]);
        return {
          count: async () => (present ? 1 : 0),
          first: () => ({ isVisible: async () => options.markerVisible ?? true })
        };
      }
      if (selector === '[data-screen]') {
        return {
          count: async () => markers.length,
          evaluateAll: async () => markers
        };
      }
      throw new Error(`fake page: unmodelled selector ${selector}`);
    },
    // window.open spy installation (openedUrl assert) — added in 1.5.0
    addInitScript: async () => undefined
  };
  return fake as unknown as Page;
}

function makeScreenTest(cases: TestCase[]): ScreenTest {
  return {
    type: 'screen',
    source: { layout: 'test_screen' },
    metadata: { name: 'ResponsiveTest' },
    cases
  };
}

function makeRunner(
  viewport: { width: number; height: number } | null,
  config: TestRunnerConfig = {},
  pageOptions: FakePageOptions = {}
): JsonUITestRunner {
  return new JsonUITestRunner(
    makeFakePage(viewport, pageOptions),
    { screenshotOnFailure: false, ...config }
  );
}

describe('case-level responsive gating', () => {
  it('skips an unmet responsive case with skipReason responsive', async () => {
    const runner = makeRunner({ width: 375, height: 812 });
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'regular only', responsive: 'regular', steps: [] }])
    );
    expect(suite.results).toHaveLength(1);
    expect(suite.results[0]).toMatchObject({
      caseName: 'regular only',
      passed: true,
      skipped: true,
      skipReason: 'responsive'
    });
  });

  it('runs a met responsive case (no skip)', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'regular only', responsive: 'regular', steps: [] }])
    );
    expect(suite.results[0].skipped).toBeUndefined();
    expect(suite.results[0].passed).toBe(true);
  });

  it('supports constraint objects at case level', async () => {
    const runner = makeRunner({ width: 800, height: 1280 });
    const suite = await runner.runScreenTest(
      makeScreenTest([
        { name: 'in range', responsive: { minWidth: 768, maxWidth: 1024 }, steps: [] },
        { name: 'wrong orientation', responsive: { orientation: 'landscape' }, steps: [] }
      ])
    );
    expect(suite.results[0].skipped).toBeUndefined();
    expect(suite.results[1]).toMatchObject({ skipped: true, skipReason: 'responsive' });
  });

  it('honors overridden thresholds from the runner config', async () => {
    // 800px is 'medium' with web defaults but 'compact' with medium: 900
    const runner = makeRunner({ width: 800, height: 1280 }, { responsive: { medium: 900 } });
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'medium only', responsive: 'medium', steps: [] }])
    );
    expect(suite.results[0]).toMatchObject({ skipped: true, skipReason: 'responsive' });
  });

  it('falls back to window.innerWidth/innerHeight when viewportSize() is null', async () => {
    const page = makeFakePage(null);
    (page as unknown as { evaluate: () => Promise<unknown> }).evaluate =
      async () => ({ width: 1280, height: 800 });
    const runner = new JsonUITestRunner(page, { screenshotOnFailure: false });
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'regular only', responsive: 'regular', steps: [] }])
    );
    expect(suite.results[0].skipped).toBeUndefined();
    expect(suite.results[0].passed).toBe(true);
  });
});

describe('skipReason emission', () => {
  it('emits skipReason platform for a case-level platform mismatch', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'ios only', platform: 'ios', steps: [] }])
    );
    expect(suite.results[0]).toMatchObject({ skipped: true, skipReason: 'platform' });
  });

  it('platform wins when both gates are present and both unmet (deterministic rule)', async () => {
    const runner = makeRunner({ width: 375, height: 812 });
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'both unmet', platform: 'ios', responsive: 'regular', steps: [] }])
    );
    expect(suite.results[0]).toMatchObject({ skipped: true, skipReason: 'platform' });
  });

  it('emits no skipReason for a plain skip: true', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'skipped', skip: true, steps: [] }])
    );
    expect(suite.results[0].skipped).toBe(true);
    expect(suite.results[0].skipReason).toBeUndefined();
  });

  it('emits a skipped row per case for a file-level platform mismatch (no silent truncation)', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const test = makeScreenTest([
      { name: 'a', steps: [] },
      { name: 'b', steps: [] }
    ]);
    test.platform = 'ios';
    const suite = await runner.runScreenTest(test);
    expect(suite.results).toHaveLength(2);
    for (const result of suite.results) {
      expect(result).toMatchObject({ passed: true, skipped: true, skipReason: 'platform' });
    }
  });

  it('emits a skipped row for a flow-level platform mismatch (no silent truncation)', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const flow: FlowTest = {
      type: 'flow',
      metadata: { name: 'Flow' },
      platform: 'android',
      steps: []
    };
    const suite = await runner.runFlowTest(flow);
    expect(suite.results).toHaveLength(1);
    expect(suite.results[0]).toMatchObject({
      caseName: 'flow',
      passed: true,
      skipped: true,
      skipReason: 'platform'
    });
  });
});

describe('step-level conditions', () => {
  // 'addMedia' always throws on web, so the case only passes if the step was skipped
  const throwingStep = { action: 'addMedia' as const };

  it('skips a step whose when.responsive is unmet', async () => {
    const runner = makeRunner({ width: 375, height: 812 });
    const suite = await runner.runScreenTest(
      makeScreenTest([
        { name: 'gated step', steps: [{ ...throwingStep, when: { responsive: 'regular' } }] }
      ])
    );
    expect(suite.results[0].passed).toBe(true);
    expect(suite.results[0].error).toBeUndefined();
  });

  it('runs a step whose when.responsive is met', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const suite = await runner.runScreenTest(
      makeScreenTest([
        { name: 'gated step', steps: [{ ...throwingStep, when: { responsive: 'regular' } }] }
      ])
    );
    // The step ran and addMedia threw -> the gate did NOT skip it
    expect(suite.results[0].passed).toBe(false);
    expect(suite.results[0].error).toContain('addMedia');
  });

  it('fail-safe skips a step whose condition has an unknown key (never run-anyway, never throw)', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const when = { someFutureGate: true } as unknown as WhenCondition;
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'future condition', steps: [{ ...throwingStep, when }] }])
    );
    expect(suite.results[0].passed).toBe(true);
    expect(suite.results[0].error).toBeUndefined();
  });

  it('ANDs responsive with platform in a single condition', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const suite = await runner.runScreenTest(
      makeScreenTest([
        {
          name: 'platform unmet',
          steps: [{ ...throwingStep, when: { platform: 'ios', responsive: 'regular' } }]
        }
      ])
    );
    expect(suite.results[0].passed).toBe(true);
  });
});

describe('ResultsWriter skipReason serialization', () => {
  it('copies skipReason onto skipped rows only', () => {
    const json = ResultsWriter.toResultsJson([
      {
        suiteName: 'S',
        totalDurationMs: 1,
        results: [
          { testName: 'T', caseName: 'skipped by size', passed: true, skipped: true, skipReason: 'responsive', durationMs: 0 },
          { testName: 'T', caseName: 'skipped by platform', passed: true, skipped: true, skipReason: 'platform', durationMs: 0 },
          { testName: 'T', caseName: 'plain skip', passed: true, skipped: true, durationMs: 0 },
          { testName: 'T', caseName: 'passed', passed: true, durationMs: 3 }
        ]
      }
    ]);
    const rows = json.suites[0].results;
    expect(rows[0]).toMatchObject({ status: 'skipped', skipReason: 'responsive' });
    expect(rows[1]).toMatchObject({ status: 'skipped', skipReason: 'platform' });
    expect(rows[2].status).toBe('skipped');
    expect(rows[2].skipReason).toBeUndefined();
    expect(rows[3].status).toBe('passed');
    expect(rows[3].skipReason).toBeUndefined();
    // results version stays 1 (skipReason is an optional field, not a version bump)
    expect(json.version).toBe(1);
  });
});

describe('caseRetries — attempts/flaky accounting', () => {
  function makeFlakyRunner(retries: number, passOnAttempt: number): { runner: JsonUITestRunner; calls: () => number } {
    const runner = makeRunner({ width: 1280, height: 800 }, { caseRetries: retries });
    let calls = 0;
    jest.spyOn(runner as unknown as { runTestCase: () => void }, 'runTestCase').mockImplementation(
      (async (testName: string, testCase: TestCase) => {
        calls++;
        const passed = calls >= passOnAttempt;
        return {
          testName,
          caseName: testCase.name,
          passed,
          error: passed ? undefined : 'boom',
          durationMs: 1
        };
      }) as never
    );
    return { runner, calls: () => calls };
  }

  it('passes on the second attempt: attempts 2, result passed', async () => {
    const { runner, calls } = makeFlakyRunner(2, 2);
    const suite = await runner.runScreenTest(makeScreenTest([{ name: 'flaky', steps: [] }]));
    expect(calls()).toBe(2);
    expect(suite.results[0]).toMatchObject({ passed: true, attempts: 2 });
  });

  it('exhausts retries: attempts = retries + 1, result failed', async () => {
    const { runner, calls } = makeFlakyRunner(2, 99);
    const suite = await runner.runScreenTest(makeScreenTest([{ name: 'hopeless', steps: [] }]));
    expect(calls()).toBe(3);
    expect(suite.results[0]).toMatchObject({ passed: false, attempts: 3, error: 'boom' });
  });

  it('default config runs once and stamps attempts 1', async () => {
    const runner = makeRunner({ width: 1280, height: 800 });
    const suite = await runner.runScreenTest(makeScreenTest([{ name: 'plain', steps: [] }]));
    expect(suite.results[0]).toMatchObject({ passed: true, attempts: 1 });
  });

  it('skipped cases carry no attempts', async () => {
    const runner = makeRunner({ width: 1280, height: 800 }, { caseRetries: 2 });
    const suite = await runner.runScreenTest(
      makeScreenTest([{ name: 'skipped', skip: true, steps: [] }])
    );
    expect(suite.results[0].skipped).toBe(true);
    expect(suite.results[0].attempts).toBeUndefined();
  });

  it('retries the flow body and stamps attempts on the flow row', async () => {
    const runner = makeRunner({ width: 1280, height: 800 }, { caseRetries: 1 });
    let bodyRuns = 0;
    jest.spyOn(runner as unknown as { executeFlowSteps: () => void }, 'executeFlowSteps').mockImplementation(
      (async () => {
        bodyRuns++;
        if (bodyRuns === 1) throw new Error('first attempt fails');
      }) as never
    );
    const flow: FlowTest = {
      type: 'flow',
      metadata: { name: 'FlakyFlow' },
      steps: [{ screen: 'home', action: 'wait', seconds: 0 } as never]
    };
    const suite = await runner.runFlowTest(flow);
    const flowRow = suite.results.find(r => r.caseName === 'flow');
    expect(flowRow).toMatchObject({ passed: true, attempts: 2 });
  });
});

describe('ResultsWriter attempts/flaky serialization', () => {
  it('emits attempts always and flaky only on retried passes', () => {
    const json = ResultsWriter.toResultsJson([
      {
        suiteName: 'T',
        totalDurationMs: 1,
        results: [
          { testName: 'T', caseName: 'first-run pass', passed: true, attempts: 1, durationMs: 1 },
          { testName: 'T', caseName: 'flaky pass', passed: true, attempts: 2, durationMs: 1 },
          { testName: 'T', caseName: 'true failure', passed: false, attempts: 3, error: 'x', durationMs: 1 },
          { testName: 'T', caseName: 'skipped', passed: true, skipped: true, durationMs: 0 }
        ]
      }
    ]);
    const rows = json.suites[0].results;
    expect(rows[0]).toMatchObject({ status: 'passed', attempts: 1 });
    expect(rows[0].flaky).toBeUndefined();
    expect(rows[1]).toMatchObject({ status: 'passed', attempts: 2, flaky: true });
    expect(rows[2]).toMatchObject({ status: 'failed', attempts: 3 });
    expect(rows[2].flaky).toBeUndefined();
    expect(rows[3].attempts).toBeUndefined();
    expect(rows[3].flaky).toBeUndefined();
    // results version stays 1 (attempts/flaky are optional fields)
    expect(json.version).toBe(1);
  });
});

/**
 * The readiness gate.
 *
 * Was `waitForLoadState('networkidle')` — 500ms of network silence, a
 * condition on every resource the page references rather than on the screen.
 * A reporting lane hit it when a decorative image sat on a third-party host
 * that stopped answering: 11 of the 43 tests whose scenarios referenced that
 * host failed, 0 of the other 42, every failure a bare
 * `Test timeout of 30000ms exceeded` on a screen that had rendered
 * perfectly. Eight hypotheses were eliminated before the ninth was the gate.
 *
 * Web was also the only driver gating readiness on the network at all —
 * Android waits on `device.waitForIdle`, a UI condition, and never saw this.
 */
describe('screen readiness gate', () => {
  const screenTest = (
    layout?: string, screenReady?: ScreenTest['screenReady']
  ): ScreenTest => ({
    type: 'screen',
    source: { layout: layout as string },
    metadata: { name: 'ReadyTest' },
    ...(screenReady === undefined ? {} : { screenReady }),
    cases: [{ name: 'noop', steps: [] }]
  });

  const viewport = { width: 1280, height: 800 };

  it('waits for the marker and never touches the network gate', async () => {
    // The claim is not "it passes" — it is that the passing run did not use
    // networkidle at all. A gate that waited for both would still hang.
    const loadStates: string[] = [];
    const runner = makeRunner(viewport, {}, { markers: ['order_detail'], loadStates });
    const suite = await runner.runScreenTest(screenTest('layouts/order_detail.json'));
    expect(suite.results[0].passed).toBe(true);
    expect(loadStates).toEqual([]);
  });

  it('is unaffected by a page whose network never goes idle', async () => {
    // The unit-level form of the reported failure: `waitForLoadState` never
    // resolves, exactly as it behaves with one hung request. The marker gate
    // does not await it, so the run completes.
    const page = makeFakePage(viewport, { markers: ['order_detail'] });
    (page as unknown as { waitForLoadState: () => Promise<never> }).waitForLoadState =
      () => new Promise<never>(() => { /* never settles, like a hung resource */ });
    const runner = new JsonUITestRunner(page, { screenshotOnFailure: false });
    const suite = await runner.runScreenTest(screenTest('layouts/order_detail.json'));
    expect(suite.results[0].passed).toBe(true);
  });

  it('names a missing marker instead of timing out silently', async () => {
    // Propagates rather than becoming a failed case row, which is what the
    // networkidle timeout did too: the file cannot run, so it is not a
    // per-case result. Only the message changes — from a bare
    // `Test timeout of 30000ms exceeded` to what is actually wrong.
    const runner = makeRunner(
      viewport,
      { screenReadyTimeout: 0 },
      { markers: [] }
    );
    const error = await runner
      .runScreenTest(screenTest('layouts/order_detail.json'))
      .then(() => '', (e: Error) => e.message);
    // The diagnosis comes from the assertion executor — one implementation,
    // so the readiness failure and the `screen` assertion say the same thing
    // about a production build and about stale generated code.
    expect(error).toContain('screen not ready');
    expect(error).toContain('marker-absent');
    expect(error).toContain('production');
    expect(error).toContain('jui build');
    // and the way out for a project whose screens are not generated
    expect(error).toContain('screenReadyStrategy');
  });

  it('distinguishes "a different screen is showing" from "no markers at all"', async () => {
    const runner = makeRunner(
      viewport,
      { screenReadyTimeout: 0 },
      { markers: ['catalog_page'] }
    );
    const error = await runner
      .runScreenTest(screenTest('layouts/order_detail.json'))
      .then(() => '', (e: Error) => e.message);
    expect(error).toContain('previous-screen-only');
    expect(error).toContain('catalog_page');
    // The build is not the suspect here, so it must not be blamed.
    expect(error).not.toContain('jui build');
  });

  it('announces the networkidle fallback when no screen id can be derived', async () => {
    // A hand-written page has no marker and no layout to derive from. The
    // fallback is correct; doing it in silence is what made the original
    // failure so expensive, since the run looks identical either way.
    const loadStates: string[] = [];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const runner = makeRunner(viewport, {}, { loadStates });
      const suite = await runner.runScreenTest(screenTest(undefined));
      expect(suite.results[0].passed).toBe(true);
      expect(loadStates).toEqual(['networkidle']);
      const said = warn.mock.calls.map(c => String(c[0])).join('\n');
      expect(said).toContain('no screen id');
      expect(said).toContain('networkidle');
      expect(said).toContain('hung request');
    } finally {
      warn.mockRestore();
    }
  });

  it('announces a forced networkidle gate too', async () => {
    const loadStates: string[] = [];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const runner = makeRunner(
        viewport,
        { screenReadyStrategy: 'networkidle' },
        { markers: ['order_detail'], loadStates }
      );
      await runner.runScreenTest(screenTest('layouts/order_detail.json'));
      expect(loadStates).toEqual(['networkidle']);
      expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toContain('forced');
    } finally {
      warn.mockRestore();
    }
  });

  it('fails clearly when the marker gate is forced but no id can be derived', async () => {
    const runner = makeRunner(viewport, { screenReadyStrategy: 'marker' }, { markers: [] });
    const error = await runner
      .runScreenTest(screenTest(undefined))
      .then(() => '', (e: Error) => e.message);
    expect(error).toContain('no screen id could be derived');
    expect(error).toContain('source.layout');
  });

  // A screen's marker is the right thing to wait for only when the screen is
  // expected to render. Tests exist whose passing outcome is that it does not:
  // a permission check that shows a refusal in its place, an expired refresh
  // that lands on login. Their `source.layout` correctly names the screen they
  // are about, so the id is derived correctly and the wait is still wrong.
  // Seven such files in one project turned the gate into seven timeouts.
  describe('a test that expects the screen NOT to render', () => {
    it("skips the gate entirely on screenReady: 'none'", async () => {
      const loadStates: string[] = [];
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        // No marker on the page — the refusal view replaced the screen.
        const runner = makeRunner(viewport, {}, { markers: [], loadStates });
        const suite = await runner.runScreenTest(
          screenTest('layouts/admin_reservations.json', 'none'));
        expect(suite.results[0].passed).toBe(true);
        // Neither gate ran: not the marker (it would time out), and not
        // networkidle either — falling back to it would re-import the hang
        // this whole mechanism exists to avoid.
        expect(loadStates).toEqual([]);
        // Declared, not silent: the run says which gate it did not use.
        expect(warn.mock.calls.map(c => String(c[0])).join('\n'))
          .toContain('no gate');
      } finally {
        warn.mockRestore();
      }
    });

    it('waits for where it lands instead, on screenReady: { marker }', async () => {
      // The redirect case: dashboard's refresh expires and login renders.
      // Naming login keeps a positive readiness condition rather than
      // trading the gate away, so this file is still protected from hangs.
      const loadStates: string[] = [];
      const runner = makeRunner(
        viewport, {}, { markers: ['login'], loadStates });
      const suite = await runner.runScreenTest(
        screenTest('layouts/dashboard.json', { marker: 'login' }));
      expect(suite.results[0].passed).toBe(true);
      expect(loadStates).toEqual([]);
    });

    it('still fails when the declared marker is the one that is missing', async () => {
      // The declaration redirects the gate; it does not disable it.
      const runner = makeRunner(
        viewport, { screenReadyTimeout: 0 }, { markers: ['dashboard'] });
      const error = await runner
        .runScreenTest(screenTest('layouts/dashboard.json', { marker: 'login' }))
        .then(() => '', (e: Error) => e.message);
      expect(error).toContain('screen not ready');
      expect(error).toContain('login');
    });

    it('outranks a project-wide strategy that forces the marker gate', async () => {
      // Whichever way the project switch is set, the file's own statement is
      // the more specific one — and `marker` is the setting that would
      // otherwise make these seven files impossible to express.
      const runner = makeRunner(
        viewport, { screenReadyStrategy: 'marker' }, { markers: [] });
      const suite = await runner.runScreenTest(
        screenTest('layouts/admin_reservations.json', 'none'));
      expect(suite.results[0].passed).toBe(true);
    });

    it('names the per-test ways out when the derived marker times out', async () => {
      // The message a project meets before it knows the feature exists. It
      // used to offer only the project-wide switch, which buys these tests by
      // giving up the gate for every other file.
      const runner = makeRunner(
        viewport, { screenReadyTimeout: 0 }, { markers: [] });
      const error = await runner
        .runScreenTest(screenTest('layouts/admin_reservations.json'))
        .then(() => '', (e: Error) => e.message);
      expect(error).toContain("screenReady: 'none'");
      expect(error).toContain('marker:');
      expect(error).toContain('NOT to render');
    });
  });
});
