/**
 * A fake Page for runner tests that need the page's storage and the state
 * bridge: `evaluate(fn, arg)` runs `fn` in Node with a fake `window`
 * (sessionStorage / localStorage / __JSONUI_STATE__), so the driver's own
 * in-page functions are what run. Each reload / goto calls `onLoad`, which
 * plays the app (reads the payload, publishes the bridge).
 *
 * Not compiled into dist (tsconfig excludes __testing__).
 */

import { Page } from 'playwright';

export class FakeStorage {
  private items = new Map<string, string>();
  constructor(private name: string, private log: string[]) {}
  getItem(key: string): string | null { return this.items.has(key) ? (this.items.get(key) as string) : null; }
  setItem(key: string, value: string): void { this.log.push(`${this.name}.set:${key}`); this.items.set(key, String(value)); }
  removeItem(key: string): void { this.log.push(`${this.name}.remove:${key}`); this.items.delete(key); }
  clear(): void { this.log.push(`${this.name}.clear`); this.items.clear(); }
  keys(): string[] { return [...this.items.keys()]; }
}

export interface FakeWindow {
  innerWidth: number;
  innerHeight: number;
  sessionStorage: FakeStorage;
  localStorage: FakeStorage;
  __JSONUI_STATE__?: Record<string, unknown>;
  open: () => null;
  [key: string]: unknown;
}

export class FakeBrowser {
  /** Every observable effect, in order. */
  log: string[] = [];
  url: string;
  win: FakeWindow;
  markers: string[];
  /** Plays the app on each document load (reload / goto). */
  onLoad: (win: FakeWindow) => void = () => undefined;

  constructor(url = 'http://localhost/screen', markers: string[] = ['test_screen']) {
    this.url = url;
    this.markers = markers;
    this.win = {
      innerWidth: 1280,
      innerHeight: 800,
      sessionStorage: new FakeStorage('session', this.log),
      localStorage: new FakeStorage('local', this.log),
      open: () => null
    };
  }

  private load(): void {
    // A new document: window globals go, storage stays.
    delete this.win.__JSONUI_STATE__;
    this.onLoad(this.win);
  }

  page(): Page {
    const self = this;
    const context = {
      clearCookies: async () => { self.log.push('clearCookies'); },
      clearPermissions: async () => { self.log.push('clearPermissions'); },
      grantPermissions: async (perms: string[], opts?: { origin?: string }) => {
        self.log.push(`grant:${perms.join(',')}@${opts?.origin ?? '*'}`);
      }
    };
    const fake = {
      context: () => context,
      viewportSize: () => ({ width: 1280, height: 800 }),
      evaluate: async (fn: (arg: unknown) => unknown, arg?: unknown) => {
        const g = globalThis as unknown as { window?: unknown };
        const prev = g.window;
        g.window = self.win;
        try {
          return JSON.parse(JSON.stringify(fn(arg) ?? null));
        } finally {
          g.window = prev;
        }
      },
      waitForLoadState: async () => undefined,
      waitForTimeout: async () => undefined,
      screenshot: async () => Buffer.from(''),
      url: () => self.url,
      goto: async (target: string) => { self.log.push(`goto:${target}`); self.url = target; self.load(); return null; },
      reload: async () => { self.log.push('reload'); self.load(); return null; },
      locator: (selector: string) => {
        const m = /^\[data-screen="(.+)"\]$/.exec(selector);
        if (m) {
          const n = self.markers.includes(m[1]) ? 1 : 0;
          return { count: async () => n, first: () => ({ isVisible: async () => n > 0 }) };
        }
        if (selector === '[data-screen]') {
          return { evaluateAll: async () => self.markers.map(id => ({ id, visible: true })) };
        }
        throw new Error(`fake page: unmodelled selector ${selector}`);
      },
      addInitScript: async () => undefined
    };
    return fake as unknown as Page;
  }
}

/**
 * The app side, minimal: on load, read the payload, apply this screen's entry
 * against declared Data names (unknown keys rejected as `not a data field`),
 * consume it, and publish the bridge. Enough to drive the runner; the real
 * coercion is the generators' (initial-state-coercion.json).
 */
export function fakeApp(
  screenId: string,
  fields: Record<string, unknown>,
  opts: { gateClosed?: boolean; dropReceipt?: boolean } = {}
): (win: FakeWindow) => void {
  return (win) => {
    if (opts.gateClosed) return;
    const data: Record<string, unknown> = { ...fields };
    let launchId: string | null = null;
    let receipt: { applied: string[]; rejected: { key: string; reason: string }[] } | null = null;
    const raw = win.sessionStorage.getItem('JSONUI_TEST_INITIAL_STATE');
    if (raw) {
      const payload = JSON.parse(raw) as { launchId: string; screens: Record<string, Record<string, unknown>> };
      launchId = payload.launchId;
      const mine = payload.screens[screenId];
      if (mine && !opts.dropReceipt) {
        receipt = { applied: [], rejected: [] };
        for (const [key, value] of Object.entries(mine)) {
          if (key in fields) { data[key] = value; receipt.applied.push(key); }
          else receipt.rejected.push({ key, reason: 'not a data field' });
        }
        delete payload.screens[screenId];
        win.sessionStorage.setItem('JSONUI_TEST_INITIAL_STATE', JSON.stringify(payload));
      }
    }
    win.__JSONUI_STATE__ = { ...(win.__JSONUI_STATE__ ?? {}), [screenId]: { launchId, initialState: receipt, data } };
  };
}
