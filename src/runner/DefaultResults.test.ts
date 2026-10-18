/**
 * The default results location (DefaultResults.ts): every progress run also
 * writes its results to `<base>/web/<app>/<time>-<run>.json`.
 *
 * Every test here injects env / home / cwd, so nothing is written under the
 * real HOME (and jestResultsDir.ts points every other runner test at a
 * scratch folder).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Page } from 'playwright';
import { JsonUITestRunner } from './JsonUITestRunner';
import { PROGRESS_DIR_ENV } from './ProgressReporter';
import { ResultsWriter } from './ResultsWriter';
import {
  DefaultResultsFs,
  DefaultResultsOptions,
  DefaultResultsWriter,
  RESULTS_DIR_ENV,
  RESULTS_MAX_FILES,
  RESULTS_NAME_PATTERN,
  pruneResultsDir,
  resetDefaultResultsNotices,
  resultsBaseDir,
  resultsFileName,
  resultsFileTime,
  sanitizeAppSegment,
  webAppId
} from './DefaultResults';
import { ScreenTest, TestStep } from '../models/types';

const RUN = '0b9c3f5e-4a1d-4c2b-9e8f-7a6b5c4d3e2f';
const DAY = 24 * 60 * 60 * 1000;

// MARK: - Names, folders, app ids

describe('sanitizeAppSegment', () => {
  it('keeps [A-Za-z0-9._-] and replaces every other char with _', () => {
    expect(sanitizeAppSegment('my-app_1.2')).toBe('my-app_1.2');
    expect(sanitizeAppSegment('@scope/my app')).toBe('_scope_my_app');
    expect(sanitizeAppSegment('日本')).toBe('__');
    expect(sanitizeAppSegment('a/../b')).toBe('a_.._b');
  });

  it('empty or all dots -> unknown', () => {
    expect(sanitizeAppSegment('')).toBe('unknown');
    expect(sanitizeAppSegment('.')).toBe('unknown');
    expect(sanitizeAppSegment('..')).toBe('unknown');
    expect(sanitizeAppSegment('.a')).toBe('.a');
  });
});

describe('resultsBaseDir', () => {
  it('an absolute JSONUI_TEST_RESULTS_DIR wins', () => {
    expect(resultsBaseDir({ [RESULTS_DIR_ENV]: '/abs/results' }, '/home/u')).toBe('/abs/results');
  });

  it('unset, empty or relative -> <home>/.local/state/jsonui-test/results; XDG_STATE_HOME is ignored', () => {
    const fallback = path.join('/home/u', '.local/state/jsonui-test/results');
    expect(resultsBaseDir({}, '/home/u')).toBe(fallback);
    expect(resultsBaseDir({ [RESULTS_DIR_ENV]: '' }, '/home/u')).toBe(fallback);
    expect(resultsBaseDir({ [RESULTS_DIR_ENV]: 'rel/dir' }, '/home/u')).toBe(fallback);
    expect(resultsBaseDir({ XDG_STATE_HOME: '/xdg' }, '/home/u')).toBe(fallback);
  });
});

describe('webAppId', () => {
  const reader = (files: Record<string, string>) => (file: string) => {
    if (!(file in files)) throw new Error('ENOENT');
    return files[file];
  };

  it('package.json name when it is a non-empty string', () => {
    expect(webAppId('/w/app', reader({ '/w/app/package.json': '{"name":"@s/web"}' }))).toBe('@s/web');
  });

  it('else the base name of the working directory', () => {
    expect(webAppId('/w/app', reader({}))).toBe('app');
    expect(webAppId('/w/app', reader({ '/w/app/package.json': '{"name":""}' }))).toBe('app');
    expect(webAppId('/w/app', reader({ '/w/app/package.json': '{"name":3}' }))).toBe('app');
    expect(webAppId('/w/app', reader({ '/w/app/package.json': 'not json' }))).toBe('app');
  });
});

describe('file name', () => {
  it('<UTC yyyyMMddTHHmmss.SSSZ>-<run>.json, matching the pattern, and its time reads back', () => {
    const time = new Date(Date.UTC(2026, 9, 18, 18, 17, 0, 123));
    const name = resultsFileName(time, RUN);
    expect(name).toBe(`20261018T181700.123Z-${RUN}.json`);
    expect(RESULTS_NAME_PATTERN.test(name)).toBe(true);
    expect(resultsFileTime(name)).toBe(time.getTime());
  });

  it('the pattern rejects the tmp name and anything else', () => {
    const name = resultsFileName(new Date(0), RUN);
    expect(RESULTS_NAME_PATTERN.test(`.${name}.tmp`)).toBe(false);
    expect(RESULTS_NAME_PATTERN.test(name.toUpperCase())).toBe(false);
    expect(RESULTS_NAME_PATTERN.test('20261018T181700.123Z-notes.json')).toBe(false);
    expect(RESULTS_NAME_PATTERN.test('results.json')).toBe(false);
  });
});

// MARK: - The runner writes one file per progress run

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
    metadata: { name: 'ResultsTest' },
    cases: [
      { name: 'passes', steps: PASS },
      { name: 'fails', steps: FAIL },
      { name: 'skipped', skip: true, steps: PASS }
    ]
  };
}

let tmp: string;
let home: string;
let cwd: string;
let progressDir: string;
const savedProgress = process.env[PROGRESS_DIR_ENV];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jui-default-results-'));
  home = path.join(tmp, 'home');
  cwd = path.join(tmp, 'project');
  progressDir = path.join(tmp, 'progress');
  fs.mkdirSync(home);
  fs.mkdirSync(cwd);
  fs.mkdirSync(progressDir);
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: '@acme/web app' }));
  process.env[PROGRESS_DIR_ENV] = progressDir;
  resetDefaultResultsNotices();
});

afterEach(() => {
  jest.restoreAllMocks();
  if (savedProgress === undefined) delete process.env[PROGRESS_DIR_ENV];
  else process.env[PROGRESS_DIR_ENV] = savedProgress;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A clock that moves 1ms per read from a fixed time. */
function clock(start = Date.UTC(2026, 9, 18, 18, 17, 0, 0)): () => Date {
  let t = start;
  return () => new Date(t++);
}

function writerOptions(extra: Partial<DefaultResultsOptions> = {}): Partial<DefaultResultsOptions> {
  return { env: {}, home: () => home, cwd: () => cwd, now: clock(), notice: () => undefined, ...extra };
}

function makeRunner(options: Partial<DefaultResultsOptions> = writerOptions()): JsonUITestRunner {
  const runner = new JsonUITestRunner(makeFakePage(), { screenshotOnFailure: false, caseRetries: 1, testsDir: '/tests' });
  (runner as any).defaultResults = new DefaultResultsWriter(options);
  jest.spyOn(runner as any, 'executeSteps').mockImplementation(async (...args: unknown[]) => {
    if (args[0] === FAIL) throw new Error('boom');
  });
  return runner;
}

const appDir = () => path.join(home, '.local/state/jsonui-test/results/web/_acme_web_app');

function readDir(dir: string): { name: string; json: Record<string, any> }[] {
  return fs.readdirSync(dir).sort().map(name => ({ name, json: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')) }));
}

/** The run ids the progress records carry, one per .jsonl file. */
function progressRuns(): string[] {
  return fs.readdirSync(progressDir).map(f => {
    const lines = fs.readFileSync(path.join(progressDir, f), 'utf-8').trimEnd().split('\n').map(l => JSON.parse(l));
    return lines[0].run as string;
  });
}

describe('the runner writes the run to the default location (no resultsPath option on web: always)', () => {
  it('a file appears in <home>/.local/state/jsonui-test/results/web/<app>/ with run, app and file', async () => {
    const suite = await makeRunner().runScreenTest(screenTest(), '/tests/screens/login.test.json');
    const files = readDir(appDir());
    expect(files).toHaveLength(1);
    const [{ name, json }] = files;
    expect(RESULTS_NAME_PATTERN.test(name)).toBe(true);

    const [run] = progressRuns();
    expect(json.run).toBe(run);
    expect(name.endsWith(`-${run}.json`)).toBe(true);
    expect(json.app).toBe('@acme/web app');
    expect(Object.keys(json).sort()).toEqual(['app', 'format', 'generatedAt', 'platform', 'run', 'suites', 'version']);
    expect(json).toMatchObject({ format: 'jsonui-test-results', version: 1, platform: 'web' });
    expect(resultsFileTime(name)).toBe(Date.parse(json.generatedAt));
    expect(json.suites).toHaveLength(1);
    expect(json.suites[0].file).toBe('screens/login.test.json');
    // Everything but `file` is what ResultsWriter builds for the same suite.
    const { file: _file, ...rest } = json.suites[0];
    expect(rest).toEqual(ResultsWriter.toResultsJson([suite]).suites[0]);
    expect(json.suites[0].results.map((r: any) => r.status)).toEqual(['passed', 'failed', 'skipped']);
  });

  it('two runs -> two files, the first is not overwritten', async () => {
    const runner = makeRunner();
    await runner.runScreenTest(screenTest(), '/tests/a.test.json');
    await runner.runScreenTest(screenTest(), '/tests/b.test.json');
    const files = readDir(appDir());
    expect(files).toHaveLength(2);
    expect(files.map(f => f.json.suites[0].file)).toEqual(['a.test.json', 'b.test.json']);
    expect(new Set(files.map(f => f.json.run))).toEqual(new Set(progressRuns()));
    expect(new Set(files.map(f => f.json.run)).size).toBe(2);
  });

  it('beginRun / endRun over two files: one run, one file, one suite per file', async () => {
    const runner = makeRunner();
    runner.beginRun(2);
    await runner.runScreenTest(screenTest(), '/tests/a.test.json');
    await runner.runScreenTest(screenTest(), '/tests/b.test.json');
    expect(fs.existsSync(appDir())).toBe(false);
    runner.endRun();
    const files = readDir(appDir());
    expect(files).toHaveLength(1);
    expect(files[0].json.run).toBe(progressRuns()[0]);
    expect(files[0].json.suites.map((s: any) => s.file)).toEqual(['a.test.json', 'b.test.json']);
  });

  it('a test from no file is file "inline"; nothing is left but the one file (no tmp)', async () => {
    await makeRunner().runScreenTest(screenTest());
    expect(fs.readdirSync(appDir())).toHaveLength(1);
    expect(readDir(appDir())[0].json.suites[0].file).toBe('inline');
  });

  it('an absolute JSONUI_TEST_RESULTS_DIR moves the base', async () => {
    const base = path.join(tmp, 'elsewhere');
    await makeRunner(writerOptions({ env: { [RESULTS_DIR_ENV]: base } })).runScreenTest(screenTest(), '/tests/x.test.json');
    expect(fs.readdirSync(path.join(base, 'web/_acme_web_app'))).toHaveLength(1);
    expect(fs.existsSync(path.join(home, '.local'))).toBe(false);
  });
});

describe('ResultsWriter.write (the consumer\'s resultsPath) is unchanged', () => {
  it('no run / app / file keys in that file; the default file is written as well (two places)', async () => {
    const suite = await makeRunner().runScreenTest(screenTest(), '/tests/x.test.json');
    const out = path.join(tmp, 'out/jsonui-results.json');
    ResultsWriter.write([suite], out);
    const json = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(Object.keys(json).sort()).toEqual(['format', 'generatedAt', 'platform', 'suites', 'version']);
    expect(Object.keys(json.suites[0]).sort()).toEqual(['results', 'suiteName', 'totalDurationMs']);
    expect(readDir(appDir())).toHaveLength(1);
  });
});

// MARK: - Pruning

describe('pruning', () => {
  const NOW = Date.UTC(2026, 9, 18, 12, 0, 0, 0);
  const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

  it('newest 500 kept, a 15-day-old file gone, a non-matching file and a sibling app folder untouched', () => {
    const dir = appDir();
    const sibling = path.join(path.dirname(dir), 'other_app');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(sibling, { recursive: true });
    const recent: string[] = [];
    for (let i = 0; i < 501; i++) {
      const name = resultsFileName(new Date(NOW - DAY + i * 1000), uuid(i));
      recent.push(name);
      fs.writeFileSync(path.join(dir, name), '{}');
    }
    const old = resultsFileName(new Date(NOW - 15 * DAY), uuid(9999));
    fs.writeFileSync(path.join(dir, old), '{}');
    // Old timestamps, but not the pattern: never ours to delete.
    const foreign = ['20260901T000000.000Z-notes.json', 'notes.txt', `.${old}.tmp`];
    for (const name of foreign) fs.writeFileSync(path.join(dir, name), 'x');
    const siblingOld = resultsFileName(new Date(NOW - 30 * DAY), uuid(1));
    fs.writeFileSync(path.join(sibling, siblingOld), '{}');

    const written = new DefaultResultsWriter(writerOptions({ now: () => new Date(NOW) }))
      .write([{ suite: { suiteName: 'S', totalDurationMs: 0, results: [] }, file: 'inline' }], RUN);
    expect(written).toBe(path.join(dir, resultsFileName(new Date(NOW), RUN)));

    const left = fs.readdirSync(dir);
    const matching = left.filter(n => RESULTS_NAME_PATTERN.test(n)).sort();
    expect(matching).toHaveLength(RESULTS_MAX_FILES);
    expect(matching).toEqual([...recent, path.basename(written!)].sort().slice(-RESULTS_MAX_FILES));
    expect(left).not.toContain(old);
    expect(left).not.toContain(recent[0]);
    for (const name of foreign) expect(left).toContain(name);
    expect(fs.readdirSync(sibling)).toEqual([siblingOld]);
  });

  it('a file exactly 14 days old is kept', () => {
    const dir = path.join(tmp, 'p');
    fs.mkdirSync(dir);
    const edge = resultsFileName(new Date(NOW - 14 * DAY), RUN);
    fs.writeFileSync(path.join(dir, edge), '{}');
    pruneResultsDir(dir, new Date(NOW), fs as unknown as DefaultResultsFs);
    expect(fs.readdirSync(dir)).toEqual([edge]);
  });
});

// MARK: - Failure never reaches a test

describe('a failed write', () => {
  function failingFs(which: keyof DefaultResultsFs): DefaultResultsFs {
    const real = fs as unknown as DefaultResultsFs;
    return new Proxy(real, {
      get(target, key) {
        if (key === which) return () => { throw new Error(`EACCES: ${String(key)}`); };
        return (target as any)[key];
      }
    });
  }

  const outcome = (suite: Awaited<ReturnType<JsonUITestRunner['runScreenTest']>>) =>
    suite.results.map(r => [r.caseName, r.passed, r.skipped ?? false, r.error, r.failureReason, r.attempts]);

  it.each(['mkdirSync', 'writeFileSync', 'renameSync'] as const)(
    '%s throwing: the outcome is identical to a successful write, one notice per process',
    async which => {
      const good = await makeRunner().runScreenTest(screenTest(), '/tests/x.test.json');
      const notices: string[] = [];
      const runner = makeRunner(writerOptions({ fs: failingFs(which), notice: m => { notices.push(m); } }));
      const bad1 = await runner.runScreenTest(screenTest(), '/tests/x.test.json');
      const bad2 = await runner.runScreenTest(screenTest(), '/tests/x.test.json');
      expect(outcome(bad1)).toEqual(outcome(good));
      expect(outcome(bad2)).toEqual(outcome(good));
      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain(RESULTS_DIR_ENV);
      // only the successful run's file; no tmp left behind by the failed ones
      expect(fs.readdirSync(appDir())).toHaveLength(1);
    }
  );
});
