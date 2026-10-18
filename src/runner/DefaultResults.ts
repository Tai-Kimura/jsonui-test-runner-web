/**
 * JsonUI Test Runner - Web Driver
 * The default results location: every progress run also writes its results,
 * in the results.schema.json shape, to a per-app folder on the host, one new
 * file per run, so `jui viz` can read past runs.
 *
 *   <base>/web/<app-segment>/<yyyyMMddTHHmmss.SSSZ>-<run>.json
 *
 * base = $JSONUI_TEST_RESULTS_DIR when it is an absolute path, else
 * `<home>/.local/state/jsonui-test/results`. XDG_STATE_HOME is deliberately
 * not honoured (the iOS simulator cannot see the host's value, and the three
 * drivers share one location). JSONUI_TEST_RESULTS_DIR is a host-side
 * variable: it moves this driver, the iOS driver (passed to xcodebuild as
 * TEST_RUNNER_JSONUI_TEST_RESULTS_DIR) and viz, and has NO effect on the
 * Android device side, which writes to a fixed device path.
 *
 * Besides the usual results keys a default-location file carries `run` (the
 * progress records' run id), `app` (the unsanitized app id) and, on each
 * suite, `file` (the progress records' `file`). Those keys are written ONLY
 * here: ResultsWriter.write, the consumer-called writer, is unchanged.
 *
 * Writing never affects a test: every step swallows its own failure, and a
 * failure shows one notice per kind per process.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TestSuiteResult } from '../models/types';
import { ResultsJson, ResultsJsonSuite, ResultsWriter } from './ResultsWriter';

/** Host-side override of the base folder; only an absolute path counts. */
export const RESULTS_DIR_ENV = 'JSONUI_TEST_RESULTS_DIR';

/** The platform folder (and the `platform` the file carries). */
export const RESULTS_PLATFORM = 'web';

/** The only names pruning may ever delete; the dot-prefixed tmp file never matches. */
export const RESULTS_NAME_PATTERN =
  /^\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;

/** Files whose name timestamp is older than this many days are pruned. */
export const RESULTS_MAX_AGE_DAYS = 14;

/** At most this many files (the newest by name) are kept per app folder. */
export const RESULTS_MAX_FILES = 500;

/** A default-location file: the results JSON plus run / app / suites[].file. */
export interface DefaultResultsJson extends Omit<ResultsJson, 'suites'> {
  run: string;
  app: string;
  suites: (ResultsJsonSuite & { file: string })[];
}

/** One suite of the run and the `file` its progress records carry. */
export interface DefaultResultsSuite {
  suite: TestSuiteResult;
  file: string;
}

/** The file-system calls the writer makes; a test can make any of them throw. */
export interface DefaultResultsFs {
  mkdirSync(dir: string, options: { recursive: true }): unknown;
  writeFileSync(file: string, data: string, encoding: 'utf-8'): void;
  renameSync(from: string, to: string): void;
  unlinkSync(file: string): void;
  readdirSync(dir: string): string[];
  readFileSync(file: string, encoding: 'utf-8'): string;
}

/** What the writer reads from the world; injected so tests never touch the real HOME. */
export interface DefaultResultsOptions {
  env: NodeJS.ProcessEnv;
  home: () => string;
  cwd: () => string;
  now: () => Date;
  fs: DefaultResultsFs;
  notice: (message: string) => void;
}

/**
 * The app folder name: every char outside [A-Za-z0-9._-] becomes '_';
 * empty or all dots -> 'unknown' (the rule of Android ArtifactPaths.sanitize).
 */
export function sanitizeAppSegment(app: string): string {
  const segment = app.replace(/[^A-Za-z0-9._-]/g, '_');
  if (segment === '' || /^\.+$/.test(segment)) return 'unknown';
  return segment;
}

/** `$JSONUI_TEST_RESULTS_DIR` when absolute, else `<home>/.local/state/jsonui-test/results`. */
export function resultsBaseDir(env: NodeJS.ProcessEnv, home: string): string {
  const fromEnv = env[RESULTS_DIR_ENV];
  if (fromEnv && path.isAbsolute(fromEnv)) return fromEnv;
  return path.join(home, '.local', 'state', 'jsonui-test', 'results');
}

/**
 * The web app id: `name` from `<cwd>/package.json` when it is a non-empty
 * string, else the working directory's base name.
 */
export function webAppId(cwd: string, readFile: (file: string) => string): string {
  try {
    const name = JSON.parse(readFile(path.join(cwd, 'package.json')))?.name;
    if (typeof name === 'string' && name !== '') return name;
  } catch {
    // no package.json, or not JSON: fall back to the folder name
  }
  return path.basename(cwd);
}

/** `<UTC yyyyMMdd'T'HHmmss.SSS'Z'>-<run>.json`. */
export function resultsFileName(time: Date, run: string): string {
  const iso = time.toISOString(); // 2026-10-18T18:17:00.123Z
  const stamp = iso.slice(0, 10).replace(/-/g, '') + 'T' + iso.slice(11, 19).replace(/:/g, '') + iso.slice(19);
  return `${stamp}-${run}.json`;
}

/** The UTC time a matching name carries, in ms. */
export function resultsFileTime(name: string): number {
  return Date.UTC(
    Number(name.slice(0, 4)),
    Number(name.slice(4, 6)) - 1,
    Number(name.slice(6, 8)),
    Number(name.slice(9, 11)),
    Number(name.slice(11, 13)),
    Number(name.slice(13, 15)),
    Number(name.slice(16, 19))
  );
}

/**
 * Prune ONE app folder: among names matching RESULTS_NAME_PATTERN, delete
 * those older than RESULTS_MAX_AGE_DAYS, then keep the newest
 * RESULTS_MAX_FILES by name (name order is time order). Nothing else is
 * touched; no recursion. Each delete swallows its own failure.
 */
export function pruneResultsDir(dir: string, now: Date, fsPort: DefaultResultsFs): void {
  const cutoff = now.getTime() - RESULTS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const matching = fsPort.readdirSync(dir).filter(name => RESULTS_NAME_PATTERN.test(name)).sort();
  const kept: string[] = [];
  const doomed: string[] = [];
  for (const name of matching) {
    (resultsFileTime(name) < cutoff ? doomed : kept).push(name);
  }
  if (kept.length > RESULTS_MAX_FILES) {
    doomed.push(...kept.slice(0, kept.length - RESULTS_MAX_FILES));
  }
  for (const name of doomed) {
    try {
      fsPort.unlinkSync(path.join(dir, name));
    } catch {
      // already gone, or not ours to delete: leave it
    }
  }
}

const noticed = new Set<string>();

function defaultOptions(): DefaultResultsOptions {
  return {
    env: process.env,
    home: () => os.homedir(),
    cwd: () => process.cwd(),
    now: () => new Date(),
    fs: {
      mkdirSync: (dir, options) => fs.mkdirSync(dir, options),
      writeFileSync: (file, data, encoding) => fs.writeFileSync(file, data, encoding),
      renameSync: (from, to) => fs.renameSync(from, to),
      unlinkSync: file => fs.unlinkSync(file),
      readdirSync: dir => fs.readdirSync(dir),
      readFileSync: (file, encoding) => fs.readFileSync(file, encoding)
    },
    notice: message => console.warn(message)
  };
}

/** Writes one progress run's results to the default location. */
export class DefaultResultsWriter {
  private readonly options: DefaultResultsOptions;

  constructor(options: Partial<DefaultResultsOptions> = {}) {
    this.options = { ...defaultOptions(), ...options };
  }

  /** The default-location payload: the results JSON plus run / app / suites[].file. */
  payload(suites: DefaultResultsSuite[], run: string, app: string, time: Date): DefaultResultsJson {
    const base = ResultsWriter.toResultsJson(suites.map(s => s.suite), RESULTS_PLATFORM, time);
    return {
      format: base.format,
      version: base.version,
      platform: base.platform,
      generatedAt: base.generatedAt,
      run,
      app,
      suites: base.suites.map((suite, index) => ({ ...suite, file: suites[index].file }))
    };
  }

  /**
   * Write the run's file (tmp + rename, so a reader never sees half a file),
   * then prune its folder. Never throws; returns the written path, or null
   * when nothing was written.
   */
  write(suites: DefaultResultsSuite[], run: string): string | null {
    const { fs: fsPort } = this.options;
    let written: string | null = null;
    let dir = '';
    let time = new Date(0);
    try {
      time = this.options.now();
      const app = webAppId(this.options.cwd(), file => fsPort.readFileSync(file, 'utf-8'));
      dir = path.join(resultsBaseDir(this.options.env, this.options.home()), RESULTS_PLATFORM, sanitizeAppSegment(app));
      const name = resultsFileName(time, run);
      const tmp = path.join(dir, `.${name}.tmp`);
      const target = path.join(dir, name);
      fsPort.mkdirSync(dir, { recursive: true });
      try {
        fsPort.writeFileSync(tmp, JSON.stringify(this.payload(suites, run, app, time), null, 2), 'utf-8');
        fsPort.renameSync(tmp, target);
      } catch (error) {
        try {
          fsPort.unlinkSync(tmp);
        } catch {
          // nothing was left behind
        }
        throw error;
      }
      written = target;
    } catch (error) {
      this.noticeOnce('write', `jsonui-test-runner-web: could not write the run's results to ` +
        `${dir || 'the default results folder'} (${String(error)}); the tests are unaffected. ` +
        `Set ${RESULTS_DIR_ENV} to a writable absolute path to move it.`);
      return null;
    }
    try {
      pruneResultsDir(dir, time, fsPort);
    } catch (error) {
      this.noticeOnce('prune', `jsonui-test-runner-web: could not prune old results in ${dir} (${String(error)}).`);
    }
    return written;
  }

  private noticeOnce(kind: string, message: string): void {
    try {
      if (noticed.has(kind)) return;
      noticed.add(kind);
      this.options.notice(message);
    } catch {
      // a notice is never worth a test either
    }
  }
}

/** Test hook: forget which notices this process has shown. */
export function resetDefaultResultsNotices(): void {
  noticed.clear();
}
