/**
 * Unit tests for the setViewport / setOrientation actions (fake Page — no browser)
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
