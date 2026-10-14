import { inViewport, isHidden, isInViewport, shownPart, Rect } from './visibility';

// The measured shapes (2026-10-14, the conformance web host, Chromium): a
// 200px `overflow: auto` container at the top of a 720px-tall window, with
// 20px Labels at y 0 (top), 195 (half: 5px shown, its centre at 205 outside)
// and 580 (tail). Android, the baseline, calls top and half visible and tail
// not; Playwright's isVisible() called all three visible.
const windowRect: Rect = { left: 0, top: 0, right: 1280, bottom: 720 };
const scroll: Rect = { left: 0, top: 0, right: 200, bottom: 200 };
const label = (top: number): Rect => ({ left: 0, top, right: 200, bottom: top + 20 });

describe('inViewport', () => {
  it('a label inside the scroll container is in the viewport', () => {
    expect(inViewport(label(0), [windowRect, scroll])).toBe(true);
  });

  it('a label below the container fold is not, although it is inside the window', () => {
    expect(inViewport(label(580), [windowRect])).toBe(true); // control: the window alone
    expect(inViewport(label(580), [windowRect, scroll])).toBe(false);
  });

  it('a part shown is enough, its centre outside', () => {
    expect(inViewport(label(195), [windowRect, scroll])).toBe(true);
  });

  it('1px is the boundary', () => {
    expect(inViewport(label(199), [windowRect, scroll])).toBe(true);
    expect(inViewport(label(199.5), [windowRect, scroll])).toBe(false);
    expect(inViewport(label(200), [windowRect, scroll])).toBe(false);
  });

  it('every clipping ancestor cuts, not only the innermost', () => {
    const outer: Rect = { left: 0, top: -400, right: 400, bottom: -100 };
    const inner: Rect = { left: 0, top: -300, right: 400, bottom: -200 };
    const row: Rect = { left: 0, top: -280, right: 400, bottom: -240 };
    expect(inViewport(row, [outer, inner])).toBe(true); // control: without the window
    expect(inViewport(row, [windowRect, outer, inner])).toBe(false);
  });

  it('shownPart is null when nothing is left', () => {
    expect(shownPart(label(900), [windowRect])).toBeNull();
  });
});

/** A Locator stand-in: what count / isVisible / evaluate answer. */
function fakeLocator(opts: { count: number; visible?: boolean; rect?: Rect; clips?: Rect[] }) {
  const self: any = {
    count: async () => opts.count,
    first: () => self,
    isVisible: async () => opts.visible ?? true,
    evaluate: async () => ({ rect: opts.rect, clips: opts.clips }),
  };
  return self;
}

describe('isInViewport', () => {
  it('is false for no element', async () => {
    expect(await isInViewport(fakeLocator({ count: 0 }))).toBe(false);
  });

  it('is false for a hidden element whatever its box', async () => {
    expect(await isInViewport(fakeLocator({ count: 1, visible: false, rect: label(0), clips: [windowRect] }))).toBe(false);
  });

  it('reads the box and its clips from the page', async () => {
    expect(await isInViewport(fakeLocator({ count: 1, rect: label(0), clips: [windowRect, scroll] }))).toBe(true);
    expect(await isInViewport(fakeLocator({ count: 1, rect: label(580), clips: [windowRect, scroll] }))).toBe(false);
  });
});

/** A Locator stand-in for isHidden: one fake element per entry, `drawn` being what checkVisibility answers. */
function fakeElements(drawn: boolean[]) {
  const els = drawn.map((d) => ({ checkVisibility: (_o?: unknown) => d }));
  return {
    count: async () => els.length,
    evaluateAll: async (fn: (e: any[]) => unknown) => fn(els),
  } as any;
}

describe('isHidden', () => {
  it('is true for no element', async () => {
    expect(await isHidden(fakeElements([]))).toBe(true);
  });

  it('is true when no matching element is drawn (display: none or visibility: hidden)', async () => {
    expect(await isHidden(fakeElements([false]))).toBe(true);
    expect(await isHidden(fakeElements([false, false]))).toBe(true);
  });

  it('is false when any matching element is drawn, wherever it is', async () => {
    expect(await isHidden(fakeElements([true]))).toBe(false);
    expect(await isHidden(fakeElements([false, true]))).toBe(false);
  });

  it('asks checkVisibility with visibilityProperty, not opacity', async () => {
    let seen: any;
    const loc = {
      count: async () => 1,
      evaluateAll: async (fn: (e: any[]) => unknown) => fn([{ checkVisibility: (o: any) => { seen = o; return true; } }]),
    } as any;
    await isHidden(loc);
    expect(seen).toEqual({ visibilityProperty: true });
  });
});
