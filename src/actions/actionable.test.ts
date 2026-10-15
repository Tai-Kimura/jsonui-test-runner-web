import { errors, Locator, Page } from 'playwright';
import { ActionExecutor, actionabilityReason } from './ActionExecutor';

/** Playwright's own timeout messages, captured verbatim from Chromium
 * (headless shell 1248) on 2026-10-15: a disabled button, a button under an
 * overlay, a read-only input. */
const CAPTURED = {
  "disabled_click": "locator.click: Timeout 1200ms exceeded.\nCall log:\n\u001b[2m  - waiting for locator('#dis')\u001b[22m\n\u001b[2m    - locator resolved to <button id=\"dis\" disabled>x</button>\u001b[22m\n\u001b[2m  - attempting click action\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is not enabled\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m    - waiting 20ms\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is not enabled\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m      - waiting 100ms\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is not enabled\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m      - waiting 500ms\u001b[22m\n",
  "covered_click": "locator.click: Timeout 1200ms exceeded.\nCall log:\n\u001b[2m  - waiting for locator('#cov')\u001b[22m\n\u001b[2m    - locator resolved to <button id=\"cov\">covered</button>\u001b[22m\n\u001b[2m  - attempting click action\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is visible, enabled and stable\u001b[22m\n\u001b[2m      - scrolling into view if needed\u001b[22m\n\u001b[2m      - done scrolling\u001b[22m\n\u001b[2m      - <div id=\"ov\"></div> intercepts pointer events\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m    - waiting 20ms\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is visible, enabled and stable\u001b[22m\n\u001b[2m      - scrolling into view if needed\u001b[22m\n\u001b[2m      - done scrolling\u001b[22m\n\u001b[2m      - <div id=\"ov\"></div> intercepts pointer events\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m      - waiting 100ms\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and stable\u001b[22m\n\u001b[2m      - element is visible, enabled and stable\u001b[22m\n\u001b[2m      - scrolling into view if needed\u001b[22m\n\u001b[2m      - done scrolling\u001b[22m\n\u001b[2m      - <div id=\"ov\"></div> intercepts pointer events\u001b[22m\n\u001b[2m    - retrying click action\u001b[22m\n\u001b[2m      - waiting 500ms\u001b[22m\n",
  "readonly_fill": "locator.fill: Timeout 1200ms exceeded.\nCall log:\n\u001b[2m  - waiting for locator('#ro')\u001b[22m\n\u001b[2m    - locator resolved to <input id=\"ro\" readonly value=\"a\"/>\u001b[22m\n\u001b[2m    - fill(\"b\")\u001b[22m\n\u001b[2m  - attempting fill action\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and editable\u001b[22m\n\u001b[2m      - element is not editable\u001b[22m\n\u001b[2m    - retrying fill action\u001b[22m\n\u001b[2m    - waiting 20ms\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and editable\u001b[22m\n\u001b[2m      - element is not editable\u001b[22m\n\u001b[2m    - retrying fill action\u001b[22m\n\u001b[2m      - waiting 100ms\u001b[22m\n\u001b[2m    2 × waiting for element to be visible, enabled and editable\u001b[22m\n\u001b[2m      - element is not editable\u001b[22m\n\u001b[2m    - retrying fill action\u001b[22m\n\u001b[2m      - waiting 500ms\u001b[22m\n"
} as const;

describe('actionabilityReason', () => {
  it('names the condition Playwright was waiting on, not its retry bookkeeping', () => {
    expect(actionabilityReason(CAPTURED.disabled_click)).toBe('element is not enabled');
    expect(actionabilityReason(CAPTURED.covered_click)).toBe('<div id="ov"></div> intercepts pointer events');
    expect(actionabilityReason(CAPTURED.readonly_fill)).toBe('element is not editable');
  });

  it('a message with no call log keeps its first line', () => {
    expect(actionabilityReason('locator.click: Timeout 5ms exceeded.')).toBe('locator.click: Timeout 5ms exceeded.');
  });
});

/**
 * A locator whose action never becomes possible: with a timeout it rejects
 * with Playwright's TimeoutError (the captured message), without one it never
 * settles — the old hang, which ended only at the test's own timeout.
 */
/** Playwright's TimeoutError from another playwright(-core) copy: same name, other class. */
class ForeignTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

function neverActionable(calls: Array<number | undefined>, foreign = false): Locator {
  const act = (options?: { timeout?: number }) => {
    calls.push(options?.timeout);
    if (options?.timeout === undefined) return new Promise(() => undefined);
    const e = foreign ? new ForeignTimeoutError(CAPTURED.disabled_click) : new errors.TimeoutError(CAPTURED.disabled_click);
    return new Promise((_, reject) => setTimeout(() => reject(e), 5));
  };
  const locator = {
    count: async () => 1,
    first: () => locator,
    isVisible: async () => true,
    waitFor: async () => undefined,
    click: (o?: { timeout?: number }) => act(o),
    dblclick: (o?: { timeout?: number }) => act(o),
    hover: (o?: { timeout?: number }) => act(o),
    fill: (_v: string, o?: { timeout?: number }) => act(o),
    clear: (o?: { timeout?: number }) => act(o),
    locator: () => locator,
    evaluate: async () => false
  };
  return locator as unknown as Locator;
}

describe('locator actions end at the step timeout with the reason', () => {
  for (const [step, action] of [
    [{ action: 'tap', id: 'save', timeout: 300 }, 'tap'],
    [{ action: 'doubleTap', id: 'save', timeout: 300 }, 'doubleTap'],
    [{ action: 'longPress', id: 'save', timeout: 300 }, 'longPress'],
    [{ action: 'input', id: 'save', value: 'x', timeout: 300 }, 'input'],
    [{ action: 'clear', id: 'save', timeout: 300 }, 'clear']
  ] as const) {
    it(`${action}`, async () => {
      const calls: Array<number | undefined> = [];
      const page = {
        locator: () => neverActionable(calls),
        waitForTimeout: async () => undefined,
        waitForLoadState: async () => undefined,
        mouse: { move: async () => undefined, down: async () => undefined, up: async () => undefined },
        keyboard: { press: async () => undefined }
      } as unknown as Page;
      await expect(new ActionExecutor(page).execute({ ...step })).rejects.toThrow(
        new RegExp(`^${action} 'save': not actionable within 300ms — element is not enabled$`)
      );
      expect(calls).toContain(300);
    });
  }
});

describe('a timeout thrown by another playwright copy', () => {
  it('still ends the step with the reason', async () => {
    const calls: Array<number | undefined> = [];
    const page = { locator: () => neverActionable(calls, true), waitForTimeout: async () => undefined } as unknown as Page;
    await expect(new ActionExecutor(page).execute({ action: 'tap', id: 'save', timeout: 300 })).rejects.toThrow(
      /^tap 'save': not actionable within 300ms — element is not enabled$/
    );
  });
});
