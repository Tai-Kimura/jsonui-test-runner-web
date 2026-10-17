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
 * Emitting never affects a test: every emit swallows its own failure.
 */
/** Record format version (`v`). A key is only ever added with a new one. */
export declare const PROGRESS_VERSION = 1;
/** The environment variable naming the directory the records go to. */
export declare const PROGRESS_DIR_ENV = "JSONUI_TEST_PROGRESS_DIR";
/** test / case / file longer than this many characters are cut to it plus '…'. */
export declare const PROGRESS_MAX_CHARS = 200;
/** `file` for a test that came from no file (built in code, or loaded from a string) — the same word in every driver. */
export declare const PROGRESS_INLINE_FILE = "inline";
/** The case outcome a case_end carries; 'skipped' only with attempt 0. */
export type ProgressStatus = 'passed' | 'failed' | 'skipped';
/** What one record says, before the common keys are added. */
export type ProgressEvent = {
    event: 'run_start';
    files: number;
    device?: string;
} | {
    event: 'case_start';
    file: string;
    test: string;
    case: string;
    attempt: number;
} | {
    event: 'case_end';
    file: string;
    test: string;
    case: string;
    attempt: number;
    status: ProgressStatus;
    durationMs: number;
} | {
    event: 'run_end';
    passed: number;
    failed: number;
    skipped: number;
};
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
export declare function truncateField(value: string): {
    value: string;
    truncated: boolean;
};
/**
 * The record for one event. Pure: the clock and the run id come in, so the
 * keys and values can be checked exactly. `truncated` appears only when a
 * field was cut — absent, never false.
 */
export declare function buildRecord(event: ProgressEvent, t: number, run: string): ProgressRecord;
/** Where record lines go. A throw from `write` is the reporter's to swallow. */
export interface ProgressSink {
    write(line: string): void;
}
/**
 * The web sink for one run, or null when the environment asked for none:
 * the variable unset or empty, or not naming an existing directory.
 */
export declare function progressSinkFromEnv(runId: string, env?: NodeJS.ProcessEnv): ProgressSink | null;
/**
 * One run's records: a fresh run id, the sink the environment names (read
 * once, at the start of the run), and an emit that cannot throw.
 */
export declare class ProgressReporter {
    readonly runId: string;
    private sink;
    constructor(runId?: string, sink?: ProgressSink | null);
    runStart(files: number, device?: string): void;
    caseStart(file: string, test: string, caseName: string, attempt: number): void;
    caseEnd(file: string, test: string, caseName: string, attempt: number, status: 'passed' | 'failed', durationMs: number): void;
    /** A case that never ran: no case_start, one case_end at attempt 0. */
    caseSkipped(file: string, test: string, caseName: string): void;
    runEnd(passed: number, failed: number, skipped: number): void;
    private emit;
}
//# sourceMappingURL=ProgressReporter.d.ts.map