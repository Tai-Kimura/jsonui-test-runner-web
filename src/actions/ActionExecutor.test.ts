/**
 * Unit tests for the setViewport / setOrientation / selectOption actions
 * (fake Page — no browser)
 */

import { Page } from 'playwright';
import { ActionExecutor } from './ActionExecutor';

interface FakePage {
  viewport: { width: number; height: number } | null;
  setViewportSizeCalls: Array<{ width: number; height: number }>;
  page: Page;
}

function makeFakePage(viewport: { width: number; height: number } | null): FakePage {
  const setViewportSizeCalls: Array<{ width: number; height: number }> = [];
  const fake = {
    viewportSize: () => viewport,
    setViewportSize: async (size: { width: number; height: number }) => {
      setViewportSizeCalls.push(size);
    }
  };
  return { viewport, setViewportSizeCalls, page: fake as unknown as Page };
}

describe('setViewport', () => {
  it('resizes via page.setViewportSize', async () => {
    const fake = makeFakePage({ width: 1280, height: 800 });
    const executor = new ActionExecutor(fake.page);
    await executor.execute({ action: 'setViewport', width: 375, height: 812 });
    expect(fake.setViewportSizeCalls).toEqual([{ width: 375, height: 812 }]);
  });

  it("requires 'width' and 'height'", async () => {
    const fake = makeFakePage({ width: 1280, height: 800 });
    const executor = new ActionExecutor(fake.page);
    await expect(executor.execute({ action: 'setViewport', width: 375 })).rejects.toThrow(
      "setViewport requires 'width' and 'height'"
    );
    expect(fake.setViewportSizeCalls).toEqual([]);
  });
});

describe('setOrientation', () => {
  it('swaps width/height when the orientation differs', async () => {
    const fake = makeFakePage({ width: 375, height: 812 });
    const executor = new ActionExecutor(fake.page);
    await executor.execute({ action: 'setOrientation', orientation: 'landscape' });
    expect(fake.setViewportSizeCalls).toEqual([{ width: 812, height: 375 }]);
  });

  it('is a no-op when the orientation already matches', async () => {
    const fake = makeFakePage({ width: 375, height: 812 });
    const executor = new ActionExecutor(fake.page);
    await executor.execute({ action: 'setOrientation', orientation: 'portrait' });
    expect(fake.setViewportSizeCalls).toEqual([]);
  });

  it('is a no-op with a warning for viewport: null contexts (never throws)', async () => {
    const fake = makeFakePage(null);
    const executor = new ActionExecutor(fake.page);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await executor.execute({ action: 'setOrientation', orientation: 'landscape' });
      expect(fake.setViewportSizeCalls).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('setOrientation'));
    } finally {
      warn.mockRestore();
    }
  });
});

describe('unknown actions', () => {
  it('still throws for a truly unknown action', async () => {
    const fake = makeFakePage({ width: 1280, height: 800 });
    const executor = new ActionExecutor(fake.page);
    await expect(
      executor.execute({ action: 'flyToMoon' as never })
    ).rejects.toThrow('Unknown action: flyToMoon');
  });
});

/**
 * selectOption selector precedence (schema: index, then value, then label).
 * The fake locator records what selectOption() was asked for; there is no
 * <select> descendant, so the element itself receives the call.
 */
function makeSelectPage(): { page: Page; calls: unknown[] } {
  const calls: unknown[] = [];
  const leaf = {
    waitFor: async () => undefined,
    count: async () => 0,
    selectOption: async (arg: unknown) => {
      calls.push(arg);
      return [];
    },
    locator: () => leaf,
    first: () => leaf
  };
  const fake = { locator: () => leaf };
  return { page: fake as unknown as Page, calls };
}

describe('selectOption precedence', () => {
  it('index wins when index, value and label are all given', async () => {
    // The 2026-09-03 consumer step: index plus a free-text note in label.
    const { page, calls } = makeSelectPage();
    const executor = new ActionExecutor(page);
    await executor.execute({
      action: 'selectOption', id: 'release_event_select',
      index: 1, value: '2024', label: 'R2: first selectOption (note)'
    });
    expect(calls).toEqual([{ index: 1 }]);
  });

  it('value beats label when there is no index', async () => {
    const { page, calls } = makeSelectPage();
    const executor = new ActionExecutor(page);
    await executor.execute({
      action: 'selectOption', id: 'sel', value: '2024', label: 'Twenty twenty-four'
    });
    expect(calls).toEqual([{ value: '2024' }]);
  });

  it('label alone selects by label', async () => {
    const { page, calls } = makeSelectPage();
    const executor = new ActionExecutor(page);
    await executor.execute({ action: 'selectOption', id: 'sel', label: 'Twenty twenty-four' });
    expect(calls).toEqual([{ label: 'Twenty twenty-four' }]);
  });

  it('index 0 is an index, not absence', async () => {
    const { page, calls } = makeSelectPage();
    const executor = new ActionExecutor(page);
    await executor.execute({ action: 'selectOption', id: 'sel', index: 0, value: 'x' });
    expect(calls).toEqual([{ index: 0 }]);
  });

  it('requires one selector', async () => {
    const { page, calls } = makeSelectPage();
    const executor = new ActionExecutor(page);
    await expect(executor.execute({ action: 'selectOption', id: 'sel' })).rejects.toThrow(
      "selectOption requires 'index', 'value', or 'label'"
    );
    expect(calls).toEqual([]);
  });
});
