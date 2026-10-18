"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * The default results location: every progress run also writes its results,
 * in the results.schema.json shape, to a per-app folder on the host, one new
 * file per run, so `jui viz` can read past runs.
 *
 *   <base>/web/<app-segment>/<yyyyMMddTHHmmss.SSSZ>-<run>-<fileKey8>.json
 *
 * fileKey8 names the run's test file (resultsFileKey), so pruning keeps the
 * latest result of every test file without reading any file: the rule the
 * three drivers and jui viz share, with its cases in
 * jsonui-test-runner specs/vectors/results-prune.json.
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultResultsWriter = exports.RESULTS_MAX_FILES = exports.RESULTS_MAX_AGE_DAYS = exports.RESULTS_NAME_PATTERN = exports.RESULTS_PLATFORM = exports.RESULTS_DIR_ENV = void 0;
exports.sanitizeAppSegment = sanitizeAppSegment;
exports.resultsBaseDir = resultsBaseDir;
exports.webAppId = webAppId;
exports.resultsFileKey = resultsFileKey;
exports.resultsFileName = resultsFileName;
exports.resultsFileTime = resultsFileTime;
exports.resultsToPrune = resultsToPrune;
exports.pruneResultsDir = pruneResultsDir;
exports.resetDefaultResultsNotices = resetDefaultResultsNotices;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const ResultsWriter_1 = require("./ResultsWriter");
/** Host-side override of the base folder; only an absolute path counts. */
exports.RESULTS_DIR_ENV = 'JSONUI_TEST_RESULTS_DIR';
/** The platform folder (and the `platform` the file carries). */
exports.RESULTS_PLATFORM = 'web';
/**
 * The only names pruning may ever delete; the dot-prefixed tmp file never
 * matches. Group 1 is the fileKey8; a name of the earlier shape (1.17.0, no
 * fileKey8) still matches, without it.
 */
exports.RESULTS_NAME_PATTERN = /^\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-([0-9a-f]{8}))?\.json$/;
/** A result replaced by a newer one of the same test file goes after this many days. */
exports.RESULTS_MAX_AGE_DAYS = 14;
/** Replaced results go, oldest first, until at most this many files remain per app folder. */
exports.RESULTS_MAX_FILES = 500;
/**
 * The app folder name: every char outside [A-Za-z0-9._-] becomes '_';
 * empty or all dots -> 'unknown' (the rule of Android ArtifactPaths.sanitize).
 */
function sanitizeAppSegment(app) {
    const segment = app.replace(/[^A-Za-z0-9._-]/g, '_');
    if (segment === '' || /^\.+$/.test(segment))
        return 'unknown';
    return segment;
}
/** `$JSONUI_TEST_RESULTS_DIR` when absolute, else `<home>/.local/state/jsonui-test/results`. */
function resultsBaseDir(env, home) {
    const fromEnv = env[exports.RESULTS_DIR_ENV];
    if (fromEnv && path.isAbsolute(fromEnv))
        return fromEnv;
    return path.join(home, '.local', 'state', 'jsonui-test', 'results');
}
/**
 * The web app id: `name` from `<cwd>/package.json` when it is a non-empty
 * string, else the working directory's base name.
 */
function webAppId(cwd, readFile) {
    try {
        const name = JSON.parse(readFile(path.join(cwd, 'package.json')))?.name;
        if (typeof name === 'string' && name !== '')
            return name;
    }
    catch {
        // no package.json, or not JSON: fall back to the folder name
    }
    return path.basename(cwd);
}
/**
 * The run's file key in a name: the first 8 hex digits of SHA-256 over the
 * UTF-8 of its test files — the distinct values sorted, joined with a newline
 * (a run is one file almost always; Web can carry several suites).
 */
function resultsFileKey(files) {
    const key = [...new Set(files)].sort().join('\n');
    return crypto.createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 8);
}
/** `<UTC yyyyMMdd'T'HHmmss.SSS'Z'>-<run>-<fileKey8>.json`. */
function resultsFileName(time, run, fileKey8) {
    const iso = time.toISOString(); // 2026-10-18T18:17:00.123Z
    const stamp = iso.slice(0, 10).replace(/-/g, '') + 'T' + iso.slice(11, 19).replace(/:/g, '') + iso.slice(19);
    return `${stamp}-${run}-${fileKey8}.json`;
}
/** The UTC time a matching name carries, in ms. */
function resultsFileTime(name) {
    return Date.UTC(Number(name.slice(0, 4)), Number(name.slice(4, 6)) - 1, Number(name.slice(6, 8)), Number(name.slice(9, 11)), Number(name.slice(11, 13)), Number(name.slice(13, 15)), Number(name.slice(16, 19)));
}
/**
 * The names pruning deletes from one app folder, in name order (name order is
 * time order). The newest name of each fileKey8 is always kept: a test file
 * not rerun keeps its latest result however old, and however many other
 * files ran since. The rest — older names of the same fileKey8, and names of
 * the earlier shape — go when older than maxAgeDays, then oldest first until
 * at most maxFiles names remain (a folder of more test files than maxFiles
 * keeps them all). Names not matching RESULTS_NAME_PATTERN are never chosen.
 */
function resultsToPrune(names, nowMs, maxFiles = exports.RESULTS_MAX_FILES, maxAgeDays = exports.RESULTS_MAX_AGE_DAYS) {
    const matching = [...new Set(names.filter(name => exports.RESULTS_NAME_PATTERN.test(name)))].sort();
    const latest = new Map();
    for (const name of matching) {
        const key = exports.RESULTS_NAME_PATTERN.exec(name)?.[1];
        if (key)
            latest.set(key, name); // sorted: the last one seen is the newest
    }
    const kept = new Set(latest.values());
    const cutoff = nowMs - maxAgeDays * 24 * 60 * 60 * 1000;
    const replaced = matching.filter(name => !kept.has(name));
    const doomed = new Set(replaced.filter(name => resultsFileTime(name) < cutoff));
    let remaining = matching.length - doomed.size;
    for (const name of replaced) {
        if (remaining <= maxFiles)
            break;
        if (!doomed.has(name)) {
            doomed.add(name);
            remaining -= 1;
        }
    }
    return matching.filter(name => doomed.has(name));
}
/**
 * Prune ONE app folder by resultsToPrune. Nothing else is touched; no
 * recursion. Each delete swallows its own failure.
 */
function pruneResultsDir(dir, now, fsPort) {
    for (const name of resultsToPrune(fsPort.readdirSync(dir), now.getTime())) {
        try {
            fsPort.unlinkSync(path.join(dir, name));
        }
        catch {
            // already gone, or not ours to delete: leave it
        }
    }
}
const noticed = new Set();
function defaultOptions() {
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
class DefaultResultsWriter {
    constructor(options = {}) {
        this.options = { ...defaultOptions(), ...options };
    }
    /** The default-location payload: the results JSON plus run / app / suites[].file. */
    payload(suites, run, app, time) {
        const base = ResultsWriter_1.ResultsWriter.toResultsJson(suites.map(s => s.suite), exports.RESULTS_PLATFORM, time);
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
    write(suites, run) {
        const { fs: fsPort } = this.options;
        let written = null;
        let dir = '';
        let time = new Date(0);
        try {
            time = this.options.now();
            const app = webAppId(this.options.cwd(), file => fsPort.readFileSync(file, 'utf-8'));
            dir = path.join(resultsBaseDir(this.options.env, this.options.home()), exports.RESULTS_PLATFORM, sanitizeAppSegment(app));
            const name = resultsFileName(time, run, resultsFileKey(suites.map(s => s.file)));
            const tmp = path.join(dir, `.${name}.tmp`);
            const target = path.join(dir, name);
            fsPort.mkdirSync(dir, { recursive: true });
            try {
                fsPort.writeFileSync(tmp, JSON.stringify(this.payload(suites, run, app, time), null, 2), 'utf-8');
                fsPort.renameSync(tmp, target);
            }
            catch (error) {
                try {
                    fsPort.unlinkSync(tmp);
                }
                catch {
                    // nothing was left behind
                }
                throw error;
            }
            written = target;
        }
        catch (error) {
            this.noticeOnce('write', `jsonui-test-runner-web: could not write the run's results to ` +
                `${dir || 'the default results folder'} (${String(error)}); the tests are unaffected. ` +
                `Set ${exports.RESULTS_DIR_ENV} to a writable absolute path to move it.`);
            return null;
        }
        try {
            pruneResultsDir(dir, time, fsPort);
        }
        catch (error) {
            this.noticeOnce('prune', `jsonui-test-runner-web: could not prune old results in ${dir} (${String(error)}).`);
        }
        return written;
    }
    noticeOnce(kind, message) {
        try {
            if (noticed.has(kind))
                return;
            noticed.add(kind);
            this.options.notice(message);
        }
        catch {
            // a notice is never worth a test either
        }
    }
}
exports.DefaultResultsWriter = DefaultResultsWriter;
/** Test hook: forget which notices this process has shown. */
function resetDefaultResultsNotices() {
    noticed.clear();
}
//# sourceMappingURL=DefaultResults.js.map