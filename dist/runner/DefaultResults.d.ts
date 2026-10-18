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
import { TestSuiteResult } from '../models/types';
import { ResultsJson, ResultsJsonSuite } from './ResultsWriter';
/** Host-side override of the base folder; only an absolute path counts. */
export declare const RESULTS_DIR_ENV = "JSONUI_TEST_RESULTS_DIR";
/** The platform folder (and the `platform` the file carries). */
export declare const RESULTS_PLATFORM = "web";
/** The only names pruning may ever delete; the dot-prefixed tmp file never matches. */
export declare const RESULTS_NAME_PATTERN: RegExp;
/** Files whose name timestamp is older than this many days are pruned. */
export declare const RESULTS_MAX_AGE_DAYS = 14;
/** At most this many files (the newest by name) are kept per app folder. */
export declare const RESULTS_MAX_FILES = 500;
/** A default-location file: the results JSON plus run / app / suites[].file. */
export interface DefaultResultsJson extends Omit<ResultsJson, 'suites'> {
    run: string;
    app: string;
    suites: (ResultsJsonSuite & {
        file: string;
    })[];
}
/** One suite of the run and the `file` its progress records carry. */
export interface DefaultResultsSuite {
    suite: TestSuiteResult;
    file: string;
}
/** The file-system calls the writer makes; a test can make any of them throw. */
export interface DefaultResultsFs {
    mkdirSync(dir: string, options: {
        recursive: true;
    }): unknown;
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
export declare function sanitizeAppSegment(app: string): string;
/** `$JSONUI_TEST_RESULTS_DIR` when absolute, else `<home>/.local/state/jsonui-test/results`. */
export declare function resultsBaseDir(env: NodeJS.ProcessEnv, home: string): string;
/**
 * The web app id: `name` from `<cwd>/package.json` when it is a non-empty
 * string, else the working directory's base name.
 */
export declare function webAppId(cwd: string, readFile: (file: string) => string): string;
/** `<UTC yyyyMMdd'T'HHmmss.SSS'Z'>-<run>.json`. */
export declare function resultsFileName(time: Date, run: string): string;
/** The UTC time a matching name carries, in ms. */
export declare function resultsFileTime(name: string): number;
/**
 * Prune ONE app folder: among names matching RESULTS_NAME_PATTERN, delete
 * those older than RESULTS_MAX_AGE_DAYS, then keep the newest
 * RESULTS_MAX_FILES by name (name order is time order). Nothing else is
 * touched; no recursion. Each delete swallows its own failure.
 */
export declare function pruneResultsDir(dir: string, now: Date, fsPort: DefaultResultsFs): void;
/** Writes one progress run's results to the default location. */
export declare class DefaultResultsWriter {
    private readonly options;
    constructor(options?: Partial<DefaultResultsOptions>);
    /** The default-location payload: the results JSON plus run / app / suites[].file. */
    payload(suites: DefaultResultsSuite[], run: string, app: string, time: Date): DefaultResultsJson;
    /**
     * Write the run's file (tmp + rename, so a reader never sees half a file),
     * then prune its folder. Never throws; returns the written path, or null
     * when nothing was written.
     */
    write(suites: DefaultResultsSuite[], run: string): string | null;
    private noticeOnce;
}
/** Test hook: forget which notices this process has shown. */
export declare function resetDefaultResultsNotices(): void;
//# sourceMappingURL=DefaultResults.d.ts.map