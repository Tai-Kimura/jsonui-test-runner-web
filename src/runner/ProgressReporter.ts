/**
 * JsonUI Test Runner - Web Driver
 * Test-progress records (schemas/progress.schema.json): one JSON line per
 * event while a run is under way, read by `jui viz`. results.json is only
 * written at the end; these lines are what can be watched before that.
 *
 * Web sink: `<JSONUI_TEST_PROGRESS_DIR>/<run>.jsonl`, appended. No variable,
 * or no such directory, and nothing is written — the directory is never
 * created here, so a run that was not asked to report leaves no trace.
 *
 * Results are the deliberate exception: each run's results ARE written by
 * default, with no variable set, to the default results folder
 * (DefaultResults.ts; requester's choice 2026-10-18). Progress keeps its
 * "no variable, no trace" rule — the asymmetry is intended, not an oversight.
 *
 * Emitting never affects a test: every emit swallows its own failure.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/** Record format version (`v`). A key is only ever added with a new one. */
export const PROGRESS_VERSION = 1;

/** The environment variable naming the directory the records go to. */
export const PROGRESS_DIR_ENV = 'JSONUI_TEST_PROGRESS_DIR';

/** test / case / file longer than this many characters are cut to it plus '…'. */
export const PROGRESS_MAX_CHARS = 200;

/** `file` for a test that came from no file (built in code, or loaded from a string) — the same word in every driver. */
export const PROGRESS_INLINE_FILE = 'inline';

/** The case outcome a case_end carries; 'skipped' only with attempt 0. */
export type ProgressStatus = 'passed' | 'failed' | 'skipped';

/** What one record says, before the common keys are added. */
export type ProgressEvent =
  | { event: 'run_start'; files: number; device?: string }
  | { event: 'case_start'; file: string; test: string; case: string; attempt: number }
  | {
      event: 'case_end';
      file: string;
      test: string;
      case: string;
      attempt: number;
      status: ProgressStatus;
      durationMs: number;
    }
  | { event: 'run_end'; passed: number; failed: number; skipped: number };

export type ProgressRecord = {
  v: typeof PROGRESS_VERSION;
  t: number;
  platform: 'web';
  run: string;
  truncated?: true;
} & ProgressEvent;

/**
 * Cut a string to PROGRESS_MAX_CHARS characters plus '…'. Characters, not
 * UTF-16 units: Array.from walks code points, so a cut never splits a
 * surrogate pair and the count matches the other two drivers'.
 */
export function truncateField(value: string): { value: string; truncated: boolean } {
  const chars = Array.from(value);
  if (chars.length <= PROGRESS_MAX_CHARS) {
    return { value, truncated: false };
  }
  return { value: chars.slice(0, PROGRESS_MAX_CHARS).join('') + '…', truncated: true };
}

/**
 * The record for one event. Pure: the clock and the run id come in, so the
 * keys and values can be checked exactly. `truncated` appears only when a
 * field was cut — absent, never false.
 */
export function buildRecord(event: ProgressEvent, t: number, run: string): ProgressRecord {
  const record: Record<string, unknown> = { v: PROGRESS_VERSION, t, platform: 'web', run };
  let truncated = false;
  for (const [key, value] of Object.entries(event)) {
    if (value === undefined) continue;
    if (key === 'file' || key === 'test' || key === 'case') {
      const cut = truncateField(value as string);
      record[key] = cut.value;
      truncated = truncated || cut.truncated;
    } else {
      record[key] = value;
    }
  }
  if (truncated) {
    record.truncated = true;
  }
  return record as ProgressRecord;
}

/** Where record lines go. A throw from `write` is the reporter's to swallow. */
export interface ProgressSink {
  write(line: string): void;
}

/**
 * The web sink for one run, or null when the environment asked for none:
 * the variable unset or empty, or not naming an existing directory.
 */
export function progressSinkFromEnv(
  runId: string,
  env: NodeJS.ProcessEnv = process.env
): ProgressSink | null {
  const dir = env[PROGRESS_DIR_ENV];
  if (!dir) return null;
  try {
    if (!fs.statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  const file = path.join(dir, `${runId}.jsonl`);
  return {
    // appendFileSync does not create directories: a directory removed
    // mid-run makes this throw, which the reporter swallows.
    write: (line: string) => fs.appendFileSync(file, line + '\n', 'utf-8')
  };
}

/**
 * One run's records: a fresh run id, the sink the environment names (read
 * once, at the start of the run), and an emit that cannot throw.
 */
export class ProgressReporter {
  readonly runId: string;
  private sink: ProgressSink | null;

  constructor(runId: string = crypto.randomUUID(), sink?: ProgressSink | null) {
    this.runId = runId;
    this.sink = sink === undefined ? progressSinkFromEnv(runId) : sink;
  }

  runStart(files: number, device?: string): void {
    this.emit({ event: 'run_start', files, device });
  }

  caseStart(file: string, test: string, caseName: string, attempt: number): void {
    this.emit({ event: 'case_start', file, test, case: caseName, attempt });
  }

  caseEnd(
    file: string,
    test: string,
    caseName: string,
    attempt: number,
    status: 'passed' | 'failed',
    durationMs: number
  ): void {
    this.emit({ event: 'case_end', file, test, case: caseName, attempt, status, durationMs });
  }

  /** A case that never ran: no case_start, one case_end at attempt 0. */
  caseSkipped(file: string, test: string, caseName: string): void {
    this.emit({ event: 'case_end', file, test, case: caseName, attempt: 0, status: 'skipped', durationMs: 0 });
  }

  runEnd(passed: number, failed: number, skipped: number): void {
    this.emit({ event: 'run_end', passed, failed, skipped });
  }

  private emit(event: ProgressEvent): void {
    if (!this.sink) return;
    try {
      this.sink.write(JSON.stringify(buildRecord(event, Date.now(), this.runId)));
    } catch {
      // A progress line is never worth a test: a full disk or a removed
      // directory loses the line, not the case.
    }
  }
}
