/**
 * setSliderValue and the `value` assertion on a range input: what is decided
 * before anything moves (schemas/actions.schema.json setSliderValueAction).
 *
 * Measured 2026-11-09 (React 19 range inputs, Playwright 1.64, chromium /
 * webkit / firefox alike): `fill` puts an on-grid value in exactly, with one
 * input event and one change event. A value outside the bounds or off the
 * step grid makes Playwright throw "Malformed value" AFTER the browser has
 * sanitised the DOM value (11 -> 10 on 1...10, 9.4 -> 9 on step 1) and
 * without an input event, so React's state keeps the old value and the page
 * shows another. Deciding here, before the fill, is what keeps the page and
 * the app's state the same.
 */
/** The input's own bounds and step, as its attributes say. */
export interface RangeInput {
    min: number;
    max: number;
    /** null: step="any", a continuous slider */
    step: number | null;
}
/** What the test declared beside the value. */
export interface SliderDeclaration {
    value: number;
    range?: number[];
    step?: number;
}
export declare function same(a: number, b: number): boolean;
/**
 * The attributes as a browser reads them (HTML range defaults): min 0,
 * max 100, step 1; "any" is continuous. An unparsable or non-positive step
 * falls back to 1, as the browser does.
 */
export declare function readRangeAttributes(min: string | null, max: string | null, step: string | null): RangeInput;
/** A number the way the sentences print it: no float noise (0.30000000000000004 -> 0.3). */
export declare function show(n: number): string;
/** The two grid values around `value` (grid min + k*step), clamped to the bounds. */
export declare function neighbours(value: number, input: RangeInput, step: number): [number, number];
export declare function onGrid(value: number, min: number, step: number): boolean;
/**
 * Why the value cannot be put in, or null. Checked in the schema's order:
 * the declaration against the slider first (a stale test names the slider's
 * own numbers), then the value against the slider.
 */
export declare function refusal(id: string, input: RangeInput, decl: SliderDeclaration): string | null;
/** The `value` assertion's default tolerance on web: the input holds the number written. */
export declare const DEFAULT_VALUE_TOLERANCE = 0.000001;
//# sourceMappingURL=sliderPlan.d.ts.map