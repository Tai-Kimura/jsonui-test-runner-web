/**
 * Test-progress records (progress.schema.json): the pure record builder, the
 * env-named file sink, and the runner's emits — run / attempt / skipped
 * lines in order, and a sink that throws changing nothing. Fake Page.
 *
 * PROGRESS_RECORDS_OUT=<file> writes every record these tests produced to
 * that file (one per line), for checking against the canonical schema.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Page } from 'playwright';
import { JsonUITestRunner } from './JsonUITestRunner';
import {
  PROGRESS_DIR_ENV,
  ProgressReporter,
  ProgressSink,
  buildRecord,
  progressSinkFromEnv,
  truncateField
} from './ProgressReporter';
import { FlowTest, ScreenTest, TestStep } from '../models/types';
// The module object itself: `import * as` is a copy with getters, which
// jest.spyOn cannot redefine; the reporter's reads go through to this one.
import fsModule = require('fs');

const RUN = '0b9c3f5e-4a1d-4c2b-9e8f-7a6b5c4d3e2f';
const produced: Record<string, unknown>[] = [];

afterAll(() => {
  const out = process.env.PROGRESS_RECORDS_OUT;
  if (out) fs.writeFileSync(out, produced.map(r => JSON.stringify(r)).join('\n') + '\n');
});

function keep(record: object): Record<string, any> {
  produced.push(record as Record<string, unknown>);
  return record as Record<string, any>;
}

/** A sink that keeps the lines it is handed. */
function memorySink(): ProgressSink & { lines: string[] } {
  const lines: string[] = [];
  return { lines, write: (line: string) => { lines.push(line); } };
}

describe('buildRecord', () => {
  it('run_start: the common keys, files, and device only when known', () => {
    const r = keep(buildRecord({ event: 'run_start', files: 3, device: 'chromium' }, 1700000000000, RUN));
    expect(r).toEqual({ v: 1, t: 1700000000000, platform: 'web', run: RUN, event: 'run_start', files: 3, device: 'chromium' });
    const bare = keep(buildRecord({ event: 'run_start', files: 0 }, 1, RUN));
    expect(Object.keys(bare).sort()).toEqual(['event', 'files', 'platform', 'run', 't', 'v']);
  });

  it('case_start: file, test, case, attempt — no truncated when nothing was cut', () => {
    const r = keep(buildRecord({ event: 'case_start', file: 'a/b.test.json', test: 'T', case: 'c', attempt: 1 }, 2, RUN));
    expect(r).toEqual({ v: 1, t: 2, platform: 'web', run: RUN, event: 'case_start', file: 'a/b.test.json', test: 'T', case: 'c', attempt: 1 });
  });

  it('case_end: adds status and durationMs', () => {
    const r = keep(buildRecord({
      event: 'case_end', file: 'f', test: 'T', case: 'c', attempt: 2, status: 'failed', durationMs: 15
    }, 3, RUN));
    expect(Object.keys(r).sort()).toEqual(
      ['attempt', 'case', 'durationMs', 'event', 'file', 'platform', 'run', 'status', 't', 'test', 'v']
    );
    expect(r).toMatchObject({ attempt: 2, status: 'failed', durationMs: 15 });
  });

  it('run_end: passed, failed, skipped', () => {
    const r = keep(buildRecord({ event: 'run_end', passed: 1, failed: 2, skipped: 3 }, 4, RUN));
    expect(r).toEqual({ v: 1, t: 4, platform: 'web', run: RUN, event: 'run_end', passed: 1, failed: 2, skipped: 3 });
  });
});

describe('truncation at 200 characters', () => {
  it('200 is kept, 201 is cut to 200 + …', () => {
    expect(truncateField('a'.repeat(200))).toEqual({ value: 'a'.repeat(200), truncated: false });
    expect(truncateField('a'.repeat(201))).toEqual({ value: 'a'.repeat(200) + '…', truncated: true });
  });

  it('counts characters, not UTF-16 units or bytes', () => {
    // 200 astral characters are 400 UTF-16 units and 800 bytes: still 200.
    const emoji200 = '\u{1F600}'.repeat(200);
    expect(truncateField(emoji200)).toEqual({ value: emoji200, truncated: false });
    const cut = truncateField('\u{1F600}'.repeat(201));
    expect(cut.truncated).toBe(true);
    expect(Array.from(cut.value)).toHaveLength(201);
    expect(cut.value).toBe(emoji200 + '…');
    expect(truncateField('日'.repeat(201)).value).toBe('日'.repeat(200) + '…');
  });

  it('a cut field marks the line truncated; an uncut line has no key', () => {
    const r = keep(buildRecord({ event: 'case_start', file: 'f', test: '日'.repeat(201), case: 'c', attempt: 1 }, 5, RUN));
    expect(r.test).toBe('日'.repeat(200) + '…');
    expect(r.truncated).toBe(true);
    const f = keep(buildRecord({ event: 'case_end', file: 'x'.repeat(250), test: 'T', case: 'c', attempt: 1, status: 'passed', durationMs: 1 }, 6, RUN));
    expect(f.file).toBe('x'.repeat(200) + '…');
    expect(f.truncated).toBe(true);
    const plain = keep(buildRecord({ event: 'case_start', file: 'f', test: 'a'.repeat(200), case: 'c', attempt: 1 }, 7, RUN));
    expect('truncated' in plain).toBe(false);
  });
});

describe('ProgressReporter', () => {
  it('a skipped case is one case_end at attempt 0, skipped, 0ms — no case_start', () => {
    const sink = memorySink();
    new ProgressReporter(RUN, sink).caseSkipped('f.test.json', 'T', 'c');
    expect(sink.lines).toHaveLength(1);
    const r = keep(JSON.parse(sink.lines[0]));
    expect(r).toMatchObject({ event: 'case_end', file: 'f.test.json', test: 'T', case: 'c', attempt: 0, status: 'skipped', durationMs: 0 });
    expect(Number.isInteger(r.t)).toBe(true);
  });

  it('a fresh run id is a lower-case UUID', () => {
    expect(new ProgressReporter(undefined, null).runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('a sink that throws is swallowed', () => {
    const reporter = new ProgressReporter(RUN, { write: () => { throw new Error('disk full'); } });
    expect(() => reporter.runStart(1)).not.toThrow();
  });
});

describe('progressSinkFromEnv', () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jui-progress-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('no sink when the variable is unset or empty', () => {
    expect(progressSinkFromEnv(RUN, {})).toBeNull();
    expect(progressSinkFromEnv(RUN, { [PROGRESS_DIR_ENV]: '' })).toBeNull();
  });

  it('no sink when the directory does not exist — and it is not created', () => {
    const missing = path.join(tmp, 'nope');
    expect(progressSinkFromEnv(RUN, { [PROGRESS_DIR_ENV]: missing })).toBeNull();
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('no sink when the variable names a file', () => {
    const file = path.join(tmp, 'file');
    fs.writeFileSync(file, '');
    expect(progressSinkFromEnv(RUN, { [PROGRESS_DIR_ENV]: file })).toBeNull();
  });

  it('appends one line per write to <dir>/<run>.jsonl', () => {
    const sink = progressSinkFromEnv(RUN, { [PROGRESS_DIR_ENV]: tmp });
    sink!.write('{"a":1}');
    sink!.write('{"a":2}');
    expect(fs.readFileSync(path.join(tmp, `${RUN}.jsonl`), 'utf-8')).toBe('{"a":1}\n{"a":2}\n');
  });
});

// MARK: - The runner's emits

function makeFakePage(): Page {
  const fake = {
    viewportSize: () => ({ width: 1280, height: 800 }),
    evaluate: async () => ({ width: 0, height: 0 }),
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    screenshot: async () => Buffer.from(''),
    url: () => 'http://localhost/screen',
    goto: async () => null,
    reload: async () => null,
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

const PASS: TestStep[] = [{ action: 'wait', ms: 1 } as TestStep];
const FAIL: TestStep[] = [{ action: 'wait', ms: 2 } as TestStep];

function screenTest(): ScreenTest {
  return {
    type: 'screen',
    source: { layout: 'layouts/test_screen.json' },
    metadata: { name: 'ProgressTest' },
    cases: [
      { name: 'passes', steps: PASS },
      { name: 'fails', steps: FAIL },
      { name: 'skipped', skip: true, steps: PASS }
    ]
  };
}

/** executeSteps is the door every case's steps go through: FAIL throws. */
function makeRunner(caseRetries = 1, extra: Record<string, unknown> = {}): JsonUITestRunner {
  const runner = new JsonUITestRunner(makeFakePage(), {
    screenshotOnFailure: false, caseRetries, testsDir: '/tests', ...extra
  });
  jest.spyOn(runner as any, 'executeSteps').mockImplementation(async (...args: unknown[]) => {
    if (args[0] === FAIL) throw new Error('boom');
  });
  return runner;
}

function readRun(dir: string): Record<string, any>[] {
  const files = fs.readdirSync(dir);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^[0-9a-f-]{36}\.jsonl$/);
  return fs.readFileSync(path.join(dir, files[0]), 'utf-8').trimEnd().split('\n').map(l => keep(JSON.parse(l)));
}

describe('the runner emits progress records', () => {
  let tmp: string;
  const saved = process.env[PROGRESS_DIR_ENV];
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jui-progress-run-'));
    process.env[PROGRESS_DIR_ENV] = tmp;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (saved === undefined) delete process.env[PROGRESS_DIR_ENV];
    else process.env[PROGRESS_DIR_ENV] = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('run_start, a pair per attempt, the skipped line, run_end — in order, names as results.json writes them', async () => {
    const suite = await makeRunner().runScreenTest(screenTest(), '/tests/screens/progress.test.json');
    const lines = readRun(tmp);
    expect(lines.map(l => [l.event, l.case ?? null, l.attempt ?? null, l.status ?? null])).toEqual([
      ['run_start', null, null, null],
      ['case_start', 'passes', 1, null],
      ['case_end', 'passes', 1, 'passed'],
      ['case_start', 'fails', 1, null],
      ['case_end', 'fails', 1, 'failed'],
      ['case_start', 'fails', 2, null],
      ['case_end', 'fails', 2, 'failed'],
      ['case_end', 'skipped', 0, 'skipped'],
      ['run_end', null, null, null]
    ]);
    expect(lines[0]).toMatchObject({ files: 1 });
    expect('device' in lines[0]).toBe(false);
    expect(new Set(lines.map(l => l.run)).size).toBe(1);
    for (const l of lines.slice(1, -1)) {
      expect(l).toMatchObject({ file: 'screens/progress.test.json', test: 'ProgressTest' });
    }
    expect(lines[7]).toMatchObject({ durationMs: 0 });
    // run_end counts the rows exactly as results.json does (a retried case once).
    expect(lines[8]).toMatchObject({ passed: 1, failed: 1, skipped: 1 });
    expect(suite.results.map(r => [r.testName, r.caseName])).toEqual(
      lines.filter(l => l.event === 'case_end' && (l.attempt === 0 || l.case !== 'fails' || l.attempt === 2))
        .map(l => [l.test, l.case])
    );
  });

  it('a test that came from no file (loaded from a string, or built in code) is file "inline", as in the other drivers', async () => {
    // README's own pattern: TestLoader.loadFromString(...) → runner.run(...), no path.
    await makeRunner().runScreenTest(screenTest());
    const lines = readRun(tmp);
    const caseLines = lines.filter(l => l.event === 'case_start' || l.event === 'case_end');
    expect(caseLines.length).toBeGreaterThan(0);
    for (const l of caseLines) expect(l.file).toBe('inline');
  });

  it('beginRun / endRun: one run over several files', async () => {
    const runner = makeRunner(0);
    runner.beginRun(2);
    await runner.runScreenTest(screenTest(), '/tests/a.test.json');
    await runner.runScreenTest(screenTest(), '/tests/b.test.json');
    runner.endRun();
    const lines = readRun(tmp);
    expect(lines[0]).toMatchObject({ event: 'run_start', files: 2 });
    expect(lines.filter(l => l.event === 'run_start')).toHaveLength(1);
    expect(lines.filter(l => l.event === 'run_end')).toHaveLength(1);
    expect(lines[lines.length - 1]).toMatchObject({ event: 'run_end', passed: 2, failed: 2, skipped: 2 });
    expect([...new Set(lines.filter(l => l.file).map(l => l.file))]).toEqual(['a.test.json', 'b.test.json']);
  });

  it('a flow: the body is the one case, one pair per attempt; a platform skip is the attempt-0 line', async () => {
    const runner = makeRunner(1, { verifyScreenTransitions: false });
    jest.spyOn(runner as any, 'executeFlowSteps').mockImplementation(async () => { throw new Error('flow boom'); });
    const flow: FlowTest = {
      type: 'flow',
      metadata: { name: 'ProgressFlow' },
      steps: [{ screen: 'test_screen', action: 'wait', ms: 1 }]
    } as unknown as FlowTest;
    await runner.runFlowTest(flow, '/tests/flows/f.test.json');
    await runner.runFlowTest({ ...flow, platform: 'ios' } as FlowTest, '/tests/flows/g.test.json');
    const runs = fs.readdirSync(tmp).map(f =>
      fs.readFileSync(path.join(tmp, f), 'utf-8').trimEnd().split('\n').map(l => keep(JSON.parse(l))));
    expect(runs).toHaveLength(2);
    const byFile = (file: string) => runs.find(r => r.some(l => l.file === file))!;
    expect(byFile('flows/f.test.json').map(l => [l.event, l.case ?? null, l.attempt ?? null, l.status ?? null])).toEqual([
      ['run_start', null, null, null],
      ['case_start', 'flow', 1, null],
      ['case_end', 'flow', 1, 'failed'],
      ['case_start', 'flow', 2, null],
      ['case_end', 'flow', 2, 'failed'],
      ['run_end', null, null, null]
    ]);
    expect(byFile('flows/g.test.json').map(l => [l.event, l.attempt ?? null, l.status ?? null])).toEqual([
      ['run_start', null, null],
      ['case_end', 0, 'skipped'],
      ['run_end', null, null]
    ]);
  });

  it('every results.json row has case lines: the last case_end of each adds up to run_end (teardown and launch failures included)', async () => {
    const TEARDOWN_FAIL: TestStep[] = [{ action: 'wait', ms: 3 } as TestStep];
    const runner = makeRunner(1, { verifyScreenTransitions: false });
    jest.spyOn(runner as any, 'executeSteps').mockImplementation(async (...args: unknown[]) => {
      if (args[0] === FAIL) throw new Error('boom');
      if (args[0] === TEARDOWN_FAIL) throw new Error('teardown boom');
    });
    runner.beginRun(3);
    const suites = [
      await runner.runScreenTest({ ...screenTest(), teardown: TEARDOWN_FAIL }, '/tests/shared.test.json'),
      await runner.runScreenTest(
        { ...screenTest(), caseIsolation: 'reopen', teardown: TEARDOWN_FAIL }, '/tests/reopen.test.json'
      )
    ];
    jest.spyOn(runner as any, 'applyLaunchSequence').mockImplementation(async () => { throw new Error('launch boom'); });
    const flow = {
      type: 'flow', metadata: { name: 'LaunchFails' }, steps: [{ screen: 'test_screen', action: 'wait', ms: 1 }]
    } as unknown as FlowTest;
    suites.push(await runner.runFlowTest(flow, '/tests/flow.test.json'));
    runner.endRun();

    const rows = suites.flatMap(s => s.results);
    // The rows this arm is about are really there.
    expect(rows.filter(r => r.caseName === 'teardown')).toHaveLength(3);
    expect(rows.find(r => r.testName === 'LaunchFails')).toMatchObject({ passed: false, failureReason: 'setup' });

    const lines = readRun(tmp);
    // A case_end is its row's last unless the next line starts the same case's next attempt.
    const last = lines.filter((l, i) => {
      if (l.event !== 'case_end') return false;
      const next = lines[i + 1];
      return !(next && next.event === 'case_start' && next.file === l.file && next.test === l.test &&
        next.case === l.case && next.attempt === l.attempt + 1);
    });
    expect(last.map(l => [l.test, l.case, l.status])).toEqual(
      rows.map(r => [r.testName, r.caseName, r.skipped ? 'skipped' : r.passed ? 'passed' : 'failed'])
    );
    const count = (status: string) => last.filter(l => l.status === status).length;
    const end = lines[lines.length - 1];
    expect(end.event).toBe('run_end');
    expect({ passed: count('passed'), failed: count('failed'), skipped: count('skipped') })
      .toEqual({ passed: end.passed, failed: end.failed, skipped: end.skipped });
    expect(end).toMatchObject({ passed: 2, failed: 6, skipped: 2 });
    // A teardown row is one attempt-1 pair named as results.json names it.
    const teardown = lines.filter(l => l.case === 'teardown');
    expect(teardown.map(l => [l.event, l.attempt, l.status ?? null])).toEqual([
      ['case_start', 1, null], ['case_end', 1, 'failed'],
      ['case_start', 1, null], ['case_end', 1, 'failed'],
      ['case_start', 1, null], ['case_end', 1, 'failed']
    ]);
  });

  it('a sink that throws changes no result and nothing throws out of the runner', async () => {
    delete process.env[PROGRESS_DIR_ENV];
    const quiet = await makeRunner().runScreenTest(screenTest(), '/tests/x.test.json');
    process.env[PROGRESS_DIR_ENV] = tmp;
    const append = jest.spyOn(fsModule, 'appendFileSync').mockImplementation(() => { throw new Error('EIO'); });
    const loud = await makeRunner().runScreenTest(screenTest(), '/tests/x.test.json');
    expect(append).toHaveBeenCalled();
    const strip = (rs: typeof quiet.results) => rs.map(r => ({ ...r, durationMs: 0 }));
    expect(strip(loud.results)).toEqual(strip(quiet.results));
    expect(loud.results.map(r => [r.caseName, r.passed, r.skipped ?? false, r.attempts])).toEqual([
      ['passes', true, false, 1], ['fails', false, false, 2], ['skipped', true, true, undefined]
    ]);
  });

  it('no variable: nothing is written', async () => {
    delete process.env[PROGRESS_DIR_ENV];
    const append = jest.spyOn(fsModule, 'appendFileSync');
    await makeRunner().runScreenTest(screenTest(), '/tests/x.test.json');
    expect(append).not.toHaveBeenCalled();
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('a directory that does not exist: nothing is written and it is not created', async () => {
    const missing = path.join(tmp, 'missing');
    process.env[PROGRESS_DIR_ENV] = missing;
    await makeRunner().runScreenTest(screenTest(), '/tests/x.test.json');
    expect(fs.existsSync(missing)).toBe(false);
    expect(fs.readdirSync(tmp)).toEqual([]);
  });
});
