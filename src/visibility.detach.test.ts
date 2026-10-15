import { errors, Locator, Page } from 'playwright';
import { AssertionExecutor } from './assertions/AssertionExecutor';
import { TestStep } from './models/types';
import { DETACHED, PROBE_TIMEOUT_MS, probe, viewportState } from './visibility';

/**
 * An element that is counted, reported visible, and then leaves the DOM before
 * it is measured. Playwright's locator.evaluate waits for it to be attached
 * again: with a timeout it rejects with errors.TimeoutError when the timeout
 * passes, without one it never settles (actionTimeout 0) — the hang the
 * consumer saw as "locator.evaluate: Test timeout of 30000ms exceeded".
 */
function detachingLocator(calls: { evaluate: Array<number | undefined> }): Locator {
  const locator = {
    count: async () => 1,
    first: () => locator,
    isVisible: async () => true,
    evaluate: (_fn: unknown, _arg?: unknown, options?: { timeout?: number }) => {
      calls.evaluate.push(options?.timeout);
      if (options?.timeout === undefined) return new Promise(() => undefined);
      return new Promise((_, reject) =>
        setTimeout(() => reject(new errors.TimeoutError(`locator.evaluate: Timeout ${options.timeout}ms exceeded.`)), 5)
      );
    }
  };
  return locator as unknown as Locator;
}

describe('probe', () => {
  it('a Playwright timeout is the element having left: DETACHED', async () => {
    expect(await probe(async () => { throw new errors.TimeoutError('gone'); })).toBe(DETACHED);
  });

  it('any other failure is not read as gone', async () => {
    await expect(probe(async () => { throw new Error('page crashed'); })).rejects.toThrow('page crashed');
  });

  it('passes its timeout to the operation', async () => {
    let seen = -1;
    await probe(async (t) => { seen = t; return 1; });
    expect(seen).toBe(PROBE_TIMEOUT_MS);
  });
});

describe('viewportState on an element that leaves while it is measured', () => {
  it('reads it as absent, with the measurement bounded', async () => {
    const calls = { evaluate: [] as Array<number | undefined> };
    expect(await viewportState(detachingLocator(calls))).toBe('absent');
    expect(calls.evaluate).toEqual([PROBE_TIMEOUT_MS]);
  });
});

describe('asserts around an element that leaves while it is measured', () => {
  const page = (calls: { evaluate: Array<number | undefined> }) =>
    ({ locator: () => detachingLocator(calls), waitForTimeout: async () => undefined } as unknown as Page);

  it('notVisible passes inside its own timeout', async () => {
    const calls = { evaluate: [] as Array<number | undefined> };
    const started = Date.now();
    await new AssertionExecutor(page(calls)).execute({ assert: 'notVisible', id: 'block', timeout: 3000 });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('visible fails inside its own timeout, saying it does not exist', async () => {
    const calls = { evaluate: [] as Array<number | undefined> };
    await expect(
      new AssertionExecutor(page(calls)).execute({ assert: 'visible', id: 'block', timeout: 200 })
    ).rejects.toThrow(/^Element 'block' should be visible but it does not exist$/);
    expect(calls.evaluate.every((t) => t === PROBE_TIMEOUT_MS)).toBe(true);
  });

  it('enabled and text read it as not found, inside their timeout', async () => {
    const steps: TestStep[] = [
      { assert: 'enabled', id: 'block', timeout: 200 },
      { assert: 'text', id: 'block', equals: 'x', timeout: 200 }
    ];
    for (const step of steps) {
      const calls = { evaluate: [] as Array<number | undefined> };
      await expect(new AssertionExecutor(page(calls)).execute(step)).rejects.toThrow(/^Element 'block' not found by id$/);
    }
  });
});
