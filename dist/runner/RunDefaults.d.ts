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
import type { ResponsiveOrientation, ResponsiveSizeTier, RunDefaults } from '../models/types';
/** Name the CLI writes, at the root of each installed bundle. */
export declare const RUN_DEFAULTS_FILENAME = "jsonui-test-run.json";
/** The only shape this driver knows how to read. */
export declare const SUPPORTED_SCHEMA_VERSION = 1;
/** Why `load` returned nothing, for a caller that wants to say so. */
export type RunDefaultsMiss = 'absent' | 'unreadable' | 'unknown-version';
export interface RunDefaultsLoad {
    defaults: RunDefaults | null;
    miss?: RunDefaultsMiss;
    /** Human-readable reason, always set when `defaults` is null. */
    reason?: string;
}
/**
 * Read the sidecar from a directory holding installed tests.
 *
 * Never throws: a driver that cannot read its defaults still has a run to
 * perform, and the caller decides what to say. It also never guesses — an
 * unreadable or newer-versioned file yields `null` with a reason, not an
 * empty table, because "no default declared" is a different fact from "this
 * driver could not tell".
 */
export declare function loadRunDefaults(dir: string): RunDefaultsLoad;
/**
 * The default orientation for a tier, or undefined when none is declared.
 *
 * Values the table should not hold are dropped rather than passed on: the CLI
 * validates this table before writing it, so anything else here means the
 * file was hand-edited or written by something else, and a driver that
 * forwarded it would rotate to a value no test file could have asked for.
 */
export declare function defaultOrientationForTier(defaults: RunDefaults | null, tier: ResponsiveSizeTier): ResponsiveOrientation | undefined;
//# sourceMappingURL=RunDefaults.d.ts.map