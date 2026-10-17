"use strict";
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
exports.ProgressReporter = exports.PROGRESS_MAX_CHARS = exports.PROGRESS_DIR_ENV = exports.PROGRESS_VERSION = void 0;
exports.truncateField = truncateField;
exports.buildRecord = buildRecord;
exports.progressSinkFromEnv = progressSinkFromEnv;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Record format version (`v`). A key is only ever added with a new one. */
exports.PROGRESS_VERSION = 1;
/** The environment variable naming the directory the records go to. */
exports.PROGRESS_DIR_ENV = 'JSONUI_TEST_PROGRESS_DIR';
/** test / case / file longer than this many characters are cut to it plus '…'. */
exports.PROGRESS_MAX_CHARS = 200;
/**
 * Cut a string to PROGRESS_MAX_CHARS characters plus '…'. Characters, not
 * UTF-16 units: Array.from walks code points, so a cut never splits a
 * surrogate pair and the count matches the other two drivers'.
 */
function truncateField(value) {
    const chars = Array.from(value);
    if (chars.length <= exports.PROGRESS_MAX_CHARS) {
        return { value, truncated: false };
    }
    return { value: chars.slice(0, exports.PROGRESS_MAX_CHARS).join('') + '…', truncated: true };
}
/**
 * The record for one event. Pure: the clock and the run id come in, so the
 * keys and values can be checked exactly. `truncated` appears only when a
 * field was cut — absent, never false.
 */
function buildRecord(event, t, run) {
    const record = { v: exports.PROGRESS_VERSION, t, platform: 'web', run };
    let truncated = false;
    for (const [key, value] of Object.entries(event)) {
        if (value === undefined)
            continue;
        if (key === 'file' || key === 'test' || key === 'case') {
            const cut = truncateField(value);
            record[key] = cut.value;
            truncated = truncated || cut.truncated;
        }
        else {
            record[key] = value;
        }
    }
    if (truncated) {
        record.truncated = true;
    }
    return record;
}
/**
 * The web sink for one run, or null when the environment asked for none:
 * the variable unset or empty, or not naming an existing directory.
 */
function progressSinkFromEnv(runId, env = process.env) {
    const dir = env[exports.PROGRESS_DIR_ENV];
    if (!dir)
        return null;
    try {
        if (!fs.statSync(dir).isDirectory())
            return null;
    }
    catch {
        return null;
    }
    const file = path.join(dir, `${runId}.jsonl`);
    return {
        // appendFileSync does not create directories: a directory removed
        // mid-run makes this throw, which the reporter swallows.
        write: (line) => fs.appendFileSync(file, line + '\n', 'utf-8')
    };
}
/**
 * One run's records: a fresh run id, the sink the environment names (read
 * once, at the start of the run), and an emit that cannot throw.
 */
class ProgressReporter {
    constructor(runId = crypto.randomUUID(), sink) {
        this.runId = runId;
        this.sink = sink === undefined ? progressSinkFromEnv(runId) : sink;
    }
    runStart(files, device) {
        this.emit({ event: 'run_start', files, device });
    }
    caseStart(file, test, caseName, attempt) {
        this.emit({ event: 'case_start', file, test, case: caseName, attempt });
    }
    caseEnd(file, test, caseName, attempt, status, durationMs) {
        this.emit({ event: 'case_end', file, test, case: caseName, attempt, status, durationMs });
    }
    /** A case that never ran: no case_start, one case_end at attempt 0. */
    caseSkipped(file, test, caseName) {
        this.emit({ event: 'case_end', file, test, case: caseName, attempt: 0, status: 'skipped', durationMs: 0 });
    }
    runEnd(passed, failed, skipped) {
        this.emit({ event: 'run_end', passed, failed, skipped });
    }
    emit(event) {
        if (!this.sink)
            return;
        try {
            this.sink.write(JSON.stringify(buildRecord(event, Date.now(), this.runId)));
        }
        catch {
            // A progress line is never worth a test: a full disk or a removed
            // directory loses the line, not the case.
        }
    }
}
exports.ProgressReporter = ProgressReporter;
//# sourceMappingURL=ProgressReporter.js.map