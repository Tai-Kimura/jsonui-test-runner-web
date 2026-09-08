"use strict";
/**
 * Run-scoped defaults, read from the bundle the CLI installed.
 *
 * `jsonui-test validate` writes `jsonui-test-run.json` beside the installed
 * tests on EVERY install, including when it declares nothing. That is what
 * makes the two absences distinguishable here: a missing file means the
 * bundle was installed by a CLI too old to have the feature, an empty
 * `orientation` means the project declared no default. Folding the first into
 * the second would put them back into one observation — so `load` returns
 * `null` for the missing file and never substitutes an empty table for it.
 *
 * The file carries the TABLE (tier -> orientation), not a resolved value: one
 * bundle is executed by every lane, so a value resolved at install time could
 * be right for at most one device. The resolution happens here, at run time,
 * against the tier this viewport actually falls in.
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
exports.SUPPORTED_SCHEMA_VERSION = exports.RUN_DEFAULTS_FILENAME = void 0;
exports.loadRunDefaults = loadRunDefaults;
exports.defaultOrientationForTier = defaultOrientationForTier;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/** Name the CLI writes, at the root of each installed bundle. */
exports.RUN_DEFAULTS_FILENAME = 'jsonui-test-run.json';
/** The only shape this driver knows how to read. */
exports.SUPPORTED_SCHEMA_VERSION = 1;
/**
 * Read the sidecar from a directory holding installed tests.
 *
 * Never throws: a driver that cannot read its defaults still has a run to
 * perform, and the caller decides what to say. It also never guesses — an
 * unreadable or newer-versioned file yields `null` with a reason, not an
 * empty table, because "no default declared" is a different fact from "this
 * driver could not tell".
 */
function loadRunDefaults(dir) {
    const file = path.join(dir, exports.RUN_DEFAULTS_FILENAME);
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf-8');
    }
    catch {
        return {
            defaults: null,
            miss: 'absent',
            reason: `no ${exports.RUN_DEFAULTS_FILENAME} beside the tests in ${dir} — this bundle ` +
                `was installed by a jsonui-test too old to write one, so no run ` +
                `default could be read (this is not the same as none being declared)`
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        return {
            defaults: null,
            miss: 'unreadable',
            reason: `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
        };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { defaults: null, miss: 'unreadable', reason: `${file} is not a JSON object` };
    }
    const data = parsed;
    if (data.schemaVersion !== exports.SUPPORTED_SCHEMA_VERSION) {
        return {
            defaults: null,
            miss: 'unknown-version',
            reason: `${file} declares schemaVersion ${String(data.schemaVersion)}; this ` +
                `driver reads ${exports.SUPPORTED_SCHEMA_VERSION}. Ignoring it rather than ` +
                `guessing at a shape it was not written for — upgrade the driver`
        };
    }
    return { defaults: { schemaVersion: data.schemaVersion, orientation: data.orientation ?? {} } };
}
/**
 * The default orientation for a tier, or undefined when none is declared.
 *
 * Values the table should not hold are dropped rather than passed on: the CLI
 * validates this table before writing it, so anything else here means the
 * file was hand-edited or written by something else, and a driver that
 * forwarded it would rotate to a value no test file could have asked for.
 */
function defaultOrientationForTier(defaults, tier) {
    const value = defaults?.orientation?.[tier];
    return value === 'portrait' || value === 'landscape' ? value : undefined;
}
//# sourceMappingURL=RunDefaults.js.map