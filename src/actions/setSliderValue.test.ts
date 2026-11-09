/**
 * setSliderValue, the `value` assertion and readText on a Slider (a range
 * input), one arm per web row of the family table measured 2026-11-09
 * (docs/bugs 2026-11-09-test-runner-no-slider-action): React 19 range
 * inputs under Playwright 1.64 in chromium, webkit and firefox alike.
 *
 * No browser: a fake page whose range input behaves as the measured one —
 * the browser sanitises the value (clamped to the bounds, snapped to the
 * step grid from the minimum), Playwright's fill throws "Malformed value"
 * when the input does not hold what was filled, and only a fill that holds
 * fires its one input event and one change event. The driver's own
 * evaluate callbacks run against it (HTMLInputElement is defined here).
 */

import { Page } from 'playwright';
import { ActionExecutor } from './ActionExecutor';
import { AssertionExecutor } from '../assertions/AssertionExecutor';
import { TestStep } from '../models/types';

class FakeElement {
  textContent: string | null = null;
  constructor(public id: string, public children: FakeElement[] = []) {}
  getAttribute(_name: string): string | null { return null; }
  querySelector(selector: string): FakeElement | null {
    for (const c of this.children) {
      if (c.matches(selector)) return c;
      const inner = c.querySelector(selector);
      if (inner) return inner;
    }
    return null;
  }
  matches(_selector: string): boolean { return false; }
}

class FakeInput extends FakeElement {
  type = 'range';
  events: string[] = [];
  private current: string;
  constructor(id: string, public attrs: Record<string, string>, value: string) {
    super(id);
    this.current = value;
  }
  override getAttribute(name: string): string | null { return this.attrs[name] ?? null; }
  override matches(selector: string): boolean {
    return selector.startsWith('input') && (!selector.includes('range') || this.type === 'range');
  }
  get value(): string { return this.current; }
  /** What a browser keeps for a range input given `text`. */
  sanitise(text: string): string {
    const min = Number(this.attrs.min ?? 0);
    const max = Number(this.attrs.max ?? 100);
    const stepAttr = this.attrs.step ?? '1';
    let v = Number(text);
    if (!Number.isFinite(v)) v = (min + max) / 2;
    v = Math.min(Math.max(v, min), max);
    if (stepAttr !== 'any') {
      const step = Number(stepAttr);
      v = min + Math.round((v - min) / step) * step;
      if (v > max) v -= step;
    }
    return String(Number(v.toPrecision(12)));
  }
  /** Playwright's fill on a range input, as measured. */
  fill(text: string): void {
    this.current = this.sanitise(text);
    if (this.current !== text) {
      throw new Error('locator.fill: Error: Malformed value');
    }
    this.events.push('input', 'change');
  }
}

(globalThis as Record<string, unknown>).HTMLInputElement = FakeInput;
(globalThis as Record<string, unknown>).HTMLTextAreaElement = class {};

function fakeLocator(get: () => FakeElement[]): unknown {
  const self = {
    count: async () => get().length,
    first: () => fakeLocator(() => get().slice(0, 1)),
    waitFor: async () => {
      if (get().length === 0) throw new Error('timeout');
    },
    isVisible: async () => get().length > 0,
    evaluate: async (fn: (el: unknown, arg: unknown) => unknown, arg?: unknown) => {
      const el = get()[0];
      if (!el) throw new Error('no element');
      return fn(el, arg);
    },
    locator: (selector: string) => fakeLocator(() => {
      const out: FakeElement[] = [];
      for (const el of get()) {
        if (selector.startsWith('#')) {
          const id = selector.slice(1);
          const walk = (e: FakeElement) => e.children.forEach((c) => { if (c.id === id) out.push(c); walk(c); });
          walk(el);
        } else {
          const found = el.querySelector(selector);
          if (found) out.push(found);
        }
      }
      return out;
    }),
    fill: async (text: string) => {
      const el = get()[0];
      if (!(el instanceof FakeInput)) throw new Error('not an input');
      el.fill(text);
    },
    inputValue: async () => {
      const el = get()[0];
      if (!(el instanceof FakeInput)) throw new Error('not an input');
      return el.value;
    }
  };
  return self;
}

function fakePage(roots: FakeElement[]): Page {
  const all = (): FakeElement[] => {
    const out: FakeElement[] = [];
    const walk = (e: FakeElement) => { out.push(e); e.children.forEach(walk); };
    roots.forEach(walk);
    return out;
  };
  return {
    locator: (selector: string) => fakeLocator(() => all().filter((e) => `#${e.id}` === selector)),
    waitForTimeout: async () => undefined
  } as unknown as Page;
}

/** The sliders of the measured page. */
function page() {
  const any = new FakeInput('s1to10', { min: '1', max: '10', step: 'any' }, '5');
  const step1 = new FakeInput('s1to10step1', { min: '1', max: '10', step: '1' }, '5');
  const tenth = new FakeInput('s0to1tenth', { min: '0', max: '1', step: '0.1' }, '0');
  const nested = new FakeInput('', { min: '1', max: '10', step: '1' }, '5');
  const wrapper = new FakeElement('rating', [nested]);
  const cell = new FakeElement('list_item_0', [new FakeInput('cellSlider', { min: '0', max: '100', step: 'any' }, '0')]);
  const p = fakePage([any, step1, tenth, wrapper, cell]);
  return { p, any, step1, tenth, nested, cell, cellInput: cell.children[0] as FakeInput };
}

const step = (o: Record<string, unknown>) => o as unknown as TestStep;
const act = (p: Page) => new ActionExecutor(p, 50);
const check = (p: Page) => new AssertionExecutor(p, 50);

describe('setSliderValue: an on-grid value lands exactly, with one input and one change event', () => {
  it('a continuous slider takes any value in its bounds', async () => {
    const { p, any } = page();
    await act(p).execute(step({ action: 'setSliderValue', id: 's1to10', value: 9.4 }));
    expect(any.value).toBe('9.4');
    expect(any.events).toEqual(['input', 'change']);
  });

  it('a stepped slider takes a value on its grid; range and step that match the input pass', async () => {
    const { p, step1, tenth } = page();
    await act(p).execute(step({ action: 'setSliderValue', id: 's1to10step1', value: 9, range: [1, 10], step: 1 }));
    expect(step1.value).toBe('9');
    expect(step1.events).toEqual(['input', 'change']);
    // 0.3 / 0.1 is 2.9999999999999996 in floating point: on the grid all the same.
    await act(p).execute(step({ action: 'setSliderValue', id: 's0to1tenth', value: 0.3, step: 0.1 }));
    expect(tenth.value).toBe('0.3');
  });

  it('the range input inside the element named, and within, are reached', async () => {
    const { p, nested, cellInput } = page();
    await act(p).execute(step({ action: 'setSliderValue', id: 'rating', value: 7 }));
    expect(nested.value).toBe('7');
    await act(p).execute(step({ action: 'setSliderValue', id: 'cellSlider', within: 'list_item_0', value: 42.5 }));
    expect(cellInput.value).toBe('42.5');
  });
});

describe('setSliderValue: what the browser would change fails before the input is touched', () => {
  it('outside the bounds names the bound; nothing moves and no event fires', async () => {
    const { p, any } = page();
    await expect(act(p).execute(step({ action: 'setSliderValue', id: 's1to10', value: 11 })))
      .rejects.toThrow("setSliderValue 's1to10': 11 is above the slider's range [1, 10]; the nearest value it can take is 10");
    await expect(act(p).execute(step({ action: 'setSliderValue', id: 's1to10', value: 0 })))
      .rejects.toThrow("0 is below the slider's range [1, 10]; the nearest value it can take is 1");
    expect(any.value).toBe('5');
    expect(any.events).toEqual([]);
  });

  it('off the step grid names the two nearest values; nothing moves and no event fires', async () => {
    const { p, step1, tenth } = page();
    await expect(act(p).execute(step({ action: 'setSliderValue', id: 's1to10step1', value: 9.4 })))
      .rejects.toThrow("9.4 is not on the slider's steps (1 + k * 1); the nearest values are 9 and 10");
    await expect(act(p).execute(step({ action: 'setSliderValue', id: 's0to1tenth', value: 0.25 })))
      .rejects.toThrow('the nearest values are 0.2 and 0.3');
    expect(step1.value).toBe('5');
    expect(step1.events).toEqual([]);
    expect(tenth.events).toEqual([]);
  });

  it('a declared range that is not the input\'s names the input\'s', async () => {
    const { p, any } = page();
    await expect(act(p).execute(step({ action: 'setSliderValue', id: 's1to10', value: 5, range: [0, 10] })))
      .rejects.toThrow("the step declares range [0, 10] but the slider's own is [1, 10]");
    expect(any.events).toEqual([]);
  });

  it('a declared step that is not the input\'s names the input\'s, "any" included', async () => {
    const { p, any, step1 } = page();
    await expect(act(p).execute(step({ action: 'setSliderValue', id: 's1to10', value: 5, step: 1 })))
      .rejects.toThrow("the step declares step 1 but the slider's own is any");
    await expect(act(p).execute(step({ action: 'setSliderValue', id: 's1to10step1', value: 5, step: 0.5 })))
      .rejects.toThrow("the step declares step 0.5 but the slider's own is 1");
    expect(any.events).toEqual([]);
    expect(step1.events).toEqual([]);
  });
});

describe('the value assertion reads the range input', () => {
  it('passes on the value, fails naming what the slider is at, honours tolerance and within', async () => {
    const { p } = page();
    await check(p).execute(step({ assert: 'value', id: 's1to10', equals: 5 }));
    await expect(check(p).execute(step({ assert: 'value', id: 's1to10', equals: 5.4 })))
      .rejects.toThrow("Expected value 5.4 (tolerance 0.000001) but the slider 's1to10' is at 5");
    await check(p).execute(step({ assert: 'value', id: 's1to10', equals: 5.4, tolerance: 0.5 }));
    await check(p).execute(step({ assert: 'value', id: 'rating', equals: 5 }));
    await check(p).execute(step({ assert: 'value', id: 'cellSlider', within: 'list_item_0', equals: 0 }));
  });
});

describe('readText reads a slider as the text of its value', () => {
  it('the input itself and the input inside the element named', async () => {
    const { p } = page();
    const variables: Record<string, string> = {};
    const exec = new ActionExecutor(p, 50, variables);
    await exec.execute(step({ action: 'readText', id: 's0to1tenth', variable: 'a' }));
    await exec.execute(step({ action: 'readText', id: 'rating', variable: 'b' }));
    expect(variables).toEqual({ a: '0', b: '5' });
  });
});
