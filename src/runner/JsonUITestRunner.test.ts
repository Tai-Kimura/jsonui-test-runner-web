/**
 * Unit tests for responsive gating, fail-safe condition skips and skipReason
 * emission (fake Page — no browser)
 */

import { Page } from 'playwright';
import { JsonUITestRunner, TestRunnerConfig } from './JsonUITestRunner';
import { ResultsWriter } from './ResultsWriter';
import { FlowTest, ScreenTest, TestCase, WhenCondition } from '../models/types';

function makeFakePage(viewport: { width: number; height: number } | null): Page {
  const fake = {
    viewportSize: () => viewport,
    evaluate: async () => ({ width: 0, height: 0 }),
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    screenshot: async () => Buffer.from(''),
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
  config: TestRunnerConfig = {}
): JsonUITestRunner {
  return new JsonUITestRunner(makeFakePage(viewport), { screenshotOnFailure: false, ...config });
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
