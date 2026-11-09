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

/** Relative slack for comparing two numbers that should be the same. */
const EPS = 1e-9;

export function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * The attributes as a browser reads them (HTML range defaults): min 0,
 * max 100, step 1; "any" is continuous. An unparsable or non-positive step
 * falls back to 1, as the browser does.
 */
export function readRangeAttributes(min: string | null, max: string | null, step: string | null): RangeInput {
  const num = (text: string | null, fallback: number) => {
    if (text === null || text.trim() === '') return fallback;
    const n = Number(text);
    return Number.isFinite(n) ? n : fallback;
  };
  const lo = num(min, 0);
  const hi = num(max, 100);
  let s: number | null;
  if (step !== null && step.trim().toLowerCase() === 'any') {
    s = null;
  } else {
    const n = num(step, 1);
    s = n > 0 ? n : 1;
  }
  return { min: lo, max: hi, step: s };
}

/** A number the way the sentences print it: no float noise (0.30000000000000004 -> 0.3). */
export function show(n: number): string {
  return String(Number(n.toPrecision(12)));
}

/** The two grid values around `value` (grid min + k*step), clamped to the bounds. */
export function neighbours(value: number, input: RangeInput, step: number): [number, number] {
  const k = Math.floor((value - input.min) / step + EPS);
  const below = Math.max(input.min, input.min + k * step);
  const above = Math.min(input.max, input.min + (k + 1) * step);
  return [Number(below.toPrecision(12)), Number(above.toPrecision(12))];
}

export function onGrid(value: number, min: number, step: number): boolean {
  const k = (value - min) / step;
  return Math.abs(k - Math.round(k)) <= 1e-7;
}

/**
 * Why the value cannot be put in, or null. Checked in the schema's order:
 * the declaration against the slider first (a stale test names the slider's
 * own numbers), then the value against the slider.
 */
export function refusal(id: string, input: RangeInput, decl: SliderDeclaration): string | null {
  const bounds = `[${show(input.min)}, ${show(input.max)}]`;
  const stepText = input.step === null ? 'any' : show(input.step);
  if (decl.range !== undefined) {
    const [lo, hi] = decl.range;
    if (!same(lo, input.min) || !same(hi, input.max)) {
      return `setSliderValue '${id}': range [${show(lo)}, ${show(hi)}] differs from the slider's own ${bounds}`;
    }
  }
  if (decl.step !== undefined) {
    if (input.step === null || !same(decl.step, input.step)) {
      return `setSliderValue '${id}': step ${show(decl.step)} differs from the slider's own step ${stepText}`;
    }
  }
  if (!Number.isFinite(decl.value)) {
    return `setSliderValue '${id}': value is not a number`;
  }
  if (decl.value < input.min && !same(decl.value, input.min)) {
    return `setSliderValue '${id}': ${show(decl.value)} is below the slider's minimum ${show(input.min)} (bounds ${bounds}); nothing was moved`;
  }
  if (decl.value > input.max && !same(decl.value, input.max)) {
    return `setSliderValue '${id}': ${show(decl.value)} is above the slider's maximum ${show(input.max)} (bounds ${bounds}); nothing was moved`;
  }
  if (input.step !== null && !onGrid(decl.value, input.min, input.step)) {
    const [below, above] = neighbours(decl.value, input, input.step);
    return `setSliderValue '${id}': ${show(decl.value)} is not on the slider's step grid (min ${show(input.min)}, step ${stepText}); the nearest values are ${show(below)} and ${show(above)}; nothing was moved`;
  }
  return null;
}

/** The `value` assertion's default tolerance on web: the input holds the number written. */
export const DEFAULT_VALUE_TOLERANCE = 1e-6;
