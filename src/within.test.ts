/**
 * `within` on id-targeting steps (src/resolve.ts) and `hidden` over every
 * match, against a fake page that models a small DOM tree: `#a` matches
 * every descendant of the document with id a, `#a #b` every b under an a,
 * and `locator(...).first().locator('#b')` the b's under the first a — the
 * Playwright shape byId builds. No browser.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { errors, Page } from 'playwright';
import { ActionExecutor } from './actions/ActionExecutor';
import { AssertionExecutor } from './assertions/AssertionExecutor';
import { JsonUITestRunner } from './runner/JsonUITestRunner';
import { ScreenTest, TestStep } from './models/types';

interface Spec {
  id: string;
  text?: string;
  drawn?: boolean;
  children?: Spec[];
}

class El {
  parentElement = null;
  children: El[];
  constructor(public spec: Spec, public key: string) {
    this.children = (spec.children ?? []).map((c, i) => new El(c, `${key}/${c.id}#${i}`));
  }
  get id(): string { return this.spec.id; }
  get drawn(): boolean { return this.spec.drawn ?? true; }
  get textContent(): string { return this.spec.text ?? this.children.map((c) => c.textContent).join(''); }
  getAttribute(): string | null { return null; }
  hasAttribute(): boolean { return false; }
  querySelector(): null { return null; }
  checkVisibility(): boolean { return this.drawn; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 20 }; }
  descendants(): El[] { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}

/** Every element matching a "#a #b" selector among the descendants of `roots`. */
function query(roots: El[], selector: string): El[] {
  let set = roots;
  for (const part of selector.trim().split(/\s+/)) {
    const m = /^#(.+)$/.exec(part);
    if (!m) throw new Error(`fake page: unmodelled selector ${selector}`);
    const found = set.flatMap((r) => r.descendants()).filter((e) => e.id === m[1]);
    set = [...new Set(found)];
  }
  return set;
}

function fakeLocator(resolve: () => El[], log: string[]): any {
  const first = () => resolve()[0];
  const timeoutError = (t?: number) => new errors.TimeoutError(`Timeout ${t ?? 0}ms exceeded.`);
  return {
    count: async () => resolve().length,
    first: () => fakeLocator(() => resolve().slice(0, 1), log),
    locator: (selector: string) => fakeLocator(() => query(resolve(), selector), log),
    isVisible: async () => first()?.drawn ?? false,
    evaluate: async (fn: (el: El, arg: unknown) => unknown, arg?: unknown, opts?: { timeout?: number }) => {
      const el = first();
      if (!el) throw timeoutError(opts?.timeout);
      return fn(el, arg);
    },
    evaluateAll: async (fn: (els: El[]) => unknown) => fn(resolve()),
    waitFor: async (opts: { state: string; timeout?: number }) => {
      const el = first();
      if (!el || (opts.state === 'visible' && !el.drawn)) throw timeoutError(opts.timeout);
    },
    click: async () => { log.push(`click:${first().key}`); },
    screenshot: async () => { log.push(`crop:${first().key}`); return Buffer.from('png'); },
  };
}

/**
 * The tree: a collection `list` whose three cells each hold a `label` and
 * `badge`s, and a nested collection `inner` in cells 0 and 2; `dup` twice at
 * the top, one drawn and one not; cell 1 holds `flag` twice the same way.
 */
const TREE: Spec[] = [
  { id: 'list', children: [
    { id: 'list_item_0', children: [
      { id: 'label', text: '1年' }, { id: 'badge' },
      { id: 'inner', children: [{ id: 'inner_item_0', text: 'a0' }] },
    ] },
    { id: 'list_item_1', children: [
      { id: 'label', text: '2年' }, { id: 'badge', drawn: false },
      { id: 'flag', drawn: false }, { id: 'flag' }, { id: 'ghost', drawn: false },
    ] },
    { id: 'list_item_2', children: [
      { id: 'label', text: '3年' }, { id: 'badge' }, { id: 'badge' },
      { id: 'inner', children: [{ id: 'inner_item_0', text: 'c0' }] },
    ] },
  ] },
  { id: 'dup', drawn: false },
  { id: 'dup' },
  { id: 'gone', drawn: false },
];

function fakePage(log: string[]): Page {
  const doc = new El({ id: '#document', children: TREE }, 'doc');
  const fake = {
    locator: (selector: string) => {
      const marker = /^\[data-screen="(.+)"\]$/.exec(selector);
      if (marker) {
        const n = marker[1] === 'test_screen' ? 1 : 0;
        return { count: async () => n, first: () => ({ isVisible: async () => n > 0 }) };
      }
      return fakeLocator(() => query([doc], selector), log);
    },
    viewportSize: () => ({ width: 1280, height: 720 }),
    evaluate: async () => ({ width: 1280, height: 720 }),
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    screenshot: async () => Buffer.from(''),
    url: () => 'http://localhost/fake',
    addInitScript: async () => undefined,
    mouse: { move: async () => undefined, down: async () => undefined, up: async () => undefined },
  };
  return fake as unknown as Page;
}

// The in-page functions the driver evaluates, run in Node against El.
const g = globalThis as any;
const saved: Record<string, unknown> = {};
beforeAll(() => {
  for (const k of ['HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'getComputedStyle', 'window']) saved[k] = g[k];
  g.HTMLInputElement = class {};
  g.HTMLTextAreaElement = class {};
  g.HTMLButtonElement = class {};
  g.getComputedStyle = () => ({ position: 'static', overflowX: 'visible', overflowY: 'visible' });
  g.window = { innerWidth: 1280, innerHeight: 720 };
});
afterAll(() => { for (const [k, v] of Object.entries(saved)) g[k] = v; });

let log: string[];
let assertions: AssertionExecutor;
let actions: ActionExecutor;
beforeEach(() => {
  log = [];
  const page = fakePage(log);
  assertions = new AssertionExecutor(page, 0, {
    baselineDir: fs.mkdtempSync(path.join(os.tmpdir(), 'within-')),
    updateBaselines: true,
  });
  actions = new ActionExecutor(page, 0);
});
const check = (step: TestStep) => assertions.execute({ timeout: 0, ...step });
const act = (step: TestStep) => actions.execute({ timeout: 0, ...step });

describe('within on assertions', () => {
  it('text reads the id inside the container, not the first in the page', async () => {
    await check({ assert: 'text', id: 'label', within: 'list_item_1', equals: '2年' });
    await check({ assert: 'text', id: 'label', within: 'list_item_2', contains: '3' });
    await expect(check({ assert: 'text', id: 'label', within: 'list_item_1', equals: '1年' }))
      .rejects.toThrow("Expected text '1年' but got '2年' for element 'label' inside 'list_item_1'");
  });

  it('visible looks inside the container', async () => {
    await check({ assert: 'visible', id: 'badge', within: 'list_item_0' });
    await expect(check({ assert: 'visible', id: 'badge', within: 'list_item_1' }))
      .rejects.toThrow("Element 'badge' inside 'list_item_1' should be visible but it is not in the viewport");
  });

  it('count is the matches inside the container', async () => {
    await check({ assert: 'count', id: 'badge', within: 'list_item_2', equals: 2 });
    await check({ assert: 'count', id: 'badge', within: 'list_item_1', equals: 1 });
    await check({ assert: 'count', id: 'badge', equals: 4 });
    await expect(check({ assert: 'count', id: 'badge', within: 'list_item_0', equals: 2 }))
      .rejects.toThrow("Expected 2 elements with id 'badge' inside 'list_item_0', but found 1");
  });

  it('count in a container that is not there fails (not 0)', async () => {
    await expect(check({ assert: 'count', id: 'badge', within: 'list_item_9', equals: 0 }))
      .rejects.toThrow("Container 'list_item_9' (within) not found by id");
  });

  it('screenshot cropId crops the element inside the container', async () => {
    await check({ assert: 'screenshot', name: 'cell2', cropId: 'label', within: 'list_item_2' });
    expect(log).toEqual(['crop:doc/list#0/list_item_2#2/label#0']);
  });
});

describe('within: which part is missing', () => {
  it('a container that is not there is named, with the way out', async () => {
    const e = check({ assert: 'text', id: 'label', within: 'list_item_9', equals: 'x' });
    await expect(e).rejects.toThrow(
      "Container 'list_item_9' (within) not found by id — a collection cell is in the tree only while it is drawn: scrollUntilVisible to it first"
    );
    await expect(act({ action: 'tap', id: 'label', within: 'list_item_9' }))
      .rejects.toThrow("Container 'list_item_9' (within) not found by id within 0ms");
    await expect(check({ assert: 'enabled', id: 'label', within: 'list_item_9' }))
      .rejects.toThrow("Container 'list_item_9' (within) not found by id");
  });

  it('a container that is there without the target names both ids', async () => {
    await expect(check({ assert: 'text', id: 'nope', within: 'list_item_1', equals: 'x' }))
      .rejects.toThrow("Element 'nope' not found inside 'list_item_1' (the container is there");
    await expect(act({ action: 'tap', id: 'nope', within: 'list_item_1' }))
      .rejects.toThrow("Element 'nope' not found inside 'list_item_1' within 0ms");
    await expect(check({ assert: 'visible', id: 'nope', within: 'list_item_1' }))
      .rejects.toThrow("Element 'nope' not found inside 'list_item_1'");
  });

  it('a missing container: visible fails, notVisible and hidden hold', async () => {
    await expect(check({ assert: 'visible', id: 'label', within: 'list_item_9' }))
      .rejects.toThrow("Container 'list_item_9' (within) not found by id");
    await check({ assert: 'notVisible', id: 'label', within: 'list_item_9' });
    await check({ assert: 'hidden', id: 'label', within: 'list_item_9' });
  });
});

describe('within on actions', () => {
  it('tap clicks the id inside the container', async () => {
    await act({ action: 'tap', id: 'label', within: 'list_item_2' });
    expect(log).toEqual(['click:doc/list#0/list_item_2#2/label#0']);
  });

  it('tapItem looks up <id>_item_<index> inside the container', async () => {
    await act({ action: 'tapItem', id: 'inner', index: 0, within: 'list_item_2' });
    expect(log).toEqual(['click:doc/list#0/list_item_2#2/inner#3/inner_item_0#0']);
  });

  it('waitForAny looks for every id inside the container', async () => {
    // A timeout of 0 never looks (the loop runs while elapsed < timeout), so give it one.
    await act({ action: 'waitForAny', ids: ['nope', 'label'], within: 'list_item_1', timeout: 50 });
    await act({ action: 'waitForAny', ids: ['inner_item_0'], within: 'list_item_2', timeout: 50 });
    await expect(act({ action: 'waitForAny', ids: ['nope', 'inner'], within: 'list_item_1' }))
      .rejects.toThrow("None of elements [nope, inner] appeared inside 'list_item_1' within 0ms");
    await expect(act({ action: 'waitForAny', ids: ['label'], within: 'list_item_9' }))
      .rejects.toThrow("None of elements [label] appeared: Container 'list_item_9' (within) not found by id within 0ms");
  });
});

describe('without within: unchanged', () => {
  it('the first match in the page, and the old messages', async () => {
    await act({ action: 'tap', id: 'label' });
    expect(log).toEqual(['click:doc/list#0/list_item_0#0/label#0']);
    await check({ assert: 'text', id: 'label', equals: '1年' });
    await expect(check({ assert: 'text', id: 'nope', equals: 'x' })).rejects.toThrow(/^Element 'nope' not found by id$/);
    await expect(act({ action: 'tap', id: 'nope' })).rejects.toThrow(/^Element 'nope' not found by id within 0ms$/);
    await expect(check({ assert: 'visible', id: 'nope' })).rejects.toThrow(/^Element 'nope' should be visible but it does not exist$/);
    await expect(act({ action: 'waitForAny', ids: ['nope'] })).rejects.toThrow(/^None of elements \[nope\] appeared within 0ms$/);
  });

  it('a CSS descendant form in the id keeps working', async () => {
    await check({ assert: 'text', id: 'list_item_1 #label', equals: '2年' });
  });
});

describe('hidden looks at every match', () => {
  it('two matches, one drawn: fails', async () => {
    await expect(check({ assert: 'hidden', id: 'dup' })).rejects.toThrow("Element 'dup' should be hidden but it is shown");
    await expect(check({ assert: 'hidden', id: 'flag', within: 'list_item_1' }))
      .rejects.toThrow("Element 'flag' inside 'list_item_1' should be hidden but it is shown");
  });

  it('holds when none is drawn, or none matches', async () => {
    await check({ assert: 'hidden', id: 'gone' });
    await check({ assert: 'hidden', id: 'nope' });
    await check({ assert: 'hidden', id: 'ghost', within: 'list_item_1' });
    await check({ assert: 'hidden', id: 'badge', within: 'list_item_1' });
  });
});

describe('within on a condition', () => {
  // addMedia with no paths always throws, so a case passes only if the step was skipped.
  const throwing = { action: 'addMedia' as const };
  const run = async (when: object) => {
    const test: ScreenTest = {
      type: 'screen', source: { layout: 'test_screen' }, metadata: { name: 'Within' },
      cases: [{ name: 'gated', steps: [{ ...throwing, when }] }],
    };
    const suite = await new JsonUITestRunner(fakePage([]), { screenshotOnFailure: false }).runScreenTest(test);
    return suite.results[0].passed ? 'skipped' : 'ran';
  };

  it('visible / notVisible / hidden look inside the container', async () => {
    expect(await run({ visible: 'badge', within: 'list_item_0' })).toBe('ran');
    expect(await run({ visible: 'badge', within: 'list_item_1' })).toBe('skipped');
    expect(await run({ visible: 'badge' })).toBe('ran'); // control: the first badge in the page is drawn
    expect(await run({ notVisible: 'badge', within: 'list_item_1' })).toBe('ran');
    expect(await run({ hidden: 'badge', within: 'list_item_1' })).toBe('ran');
    expect(await run({ hidden: 'flag', within: 'list_item_1' })).toBe('skipped');
  });

  it('a container that is not there: visible unmet, notVisible and hidden met', async () => {
    expect(await run({ visible: 'label', within: 'list_item_9' })).toBe('skipped');
    expect(await run({ notVisible: 'label', within: 'list_item_9' })).toBe('ran');
    expect(await run({ hidden: 'label', within: 'list_item_9' })).toBe('ran');
  });
});
