/**
 * Unit tests for the responsive resolution / matching pure logic
 * (no live browser needed — see ViewportSource)
 */

import {
  ResponsiveThresholds,
  ViewportSource,
  deriveOrientation,
  resolveSizeTier,
  matchesResponsive,
  resolveViewportSize,
  unknownConditionKeys,
  WhenCondition
} from './types';

/** Web renderer defaults (Tailwind md:/lg:) */
const THRESHOLDS: ResponsiveThresholds = { medium: 768, regular: 1024 };

describe('deriveOrientation', () => {
  it('is portrait when height > width', () => {
    expect(deriveOrientation({ width: 375, height: 812 })).toBe('portrait');
  });

  it('is landscape when width > height', () => {
    expect(deriveOrientation({ width: 812, height: 375 })).toBe('landscape');
  });

  it('treats a square viewport as landscape', () => {
    expect(deriveOrientation({ width: 500, height: 500 })).toBe('landscape');
  });
});

describe('resolveSizeTier', () => {
  it('resolves compact below the medium threshold', () => {
    expect(resolveSizeTier(767, THRESHOLDS)).toBe('compact');
  });

  it('resolves medium at the md: boundary (inclusive)', () => {
    expect(resolveSizeTier(768, THRESHOLDS)).toBe('medium');
    expect(resolveSizeTier(1023, THRESHOLDS)).toBe('medium');
  });

  it('resolves regular at the lg: boundary (inclusive)', () => {
    expect(resolveSizeTier(1024, THRESHOLDS)).toBe('regular');
    expect(resolveSizeTier(1920, THRESHOLDS)).toBe('regular');
  });

  it('honors overridden thresholds (tiers stay exclusive)', () => {
    const custom: ResponsiveThresholds = { medium: 600, regular: 840 };
    expect(resolveSizeTier(599, custom)).toBe('compact');
    expect(resolveSizeTier(700, custom)).toBe('medium');
    expect(resolveSizeTier(840, custom)).toBe('regular');
  });
});

describe('matchesResponsive - named buckets', () => {
  it('matches bare tiers at any orientation', () => {
    // compact portrait + compact landscape
    expect(matchesResponsive('compact', { width: 375, height: 812 }, THRESHOLDS)).toBe(true);
    expect(matchesResponsive('compact', { width: 667, height: 375 }, THRESHOLDS)).toBe(true);
    // medium portrait + medium landscape
    expect(matchesResponsive('medium', { width: 768, height: 1024 }, THRESHOLDS)).toBe(true);
    expect(matchesResponsive('medium', { width: 900, height: 600 }, THRESHOLDS)).toBe(true);
    // regular
    expect(matchesResponsive('regular', { width: 1280, height: 800 }, THRESHOLDS)).toBe(true);
    // non-matching tier
    expect(matchesResponsive('regular', { width: 375, height: 812 }, THRESHOLDS)).toBe(false);
    expect(matchesResponsive('compact', { width: 1280, height: 800 }, THRESHOLDS)).toBe(false);
  });

  it("matches 'landscape' at any tier", () => {
    expect(matchesResponsive('landscape', { width: 667, height: 375 }, THRESHOLDS)).toBe(true);
    expect(matchesResponsive('landscape', { width: 1280, height: 800 }, THRESHOLDS)).toBe(true);
    expect(matchesResponsive('landscape', { width: 375, height: 812 }, THRESHOLDS)).toBe(false);
  });

  it('matches <tier>-landscape only when tier AND landscape hold', () => {
    expect(matchesResponsive('regular-landscape', { width: 1280, height: 800 }, THRESHOLDS)).toBe(true);
    // regular but portrait
    expect(matchesResponsive('regular-landscape', { width: 1024, height: 1366 }, THRESHOLDS)).toBe(false);
    // landscape but medium
    expect(matchesResponsive('regular-landscape', { width: 900, height: 600 }, THRESHOLDS)).toBe(false);
    expect(matchesResponsive('compact-landscape', { width: 667, height: 375 }, THRESHOLDS)).toBe(true);
    expect(matchesResponsive('compact-landscape', { width: 375, height: 812 }, THRESHOLDS)).toBe(false);
    expect(matchesResponsive('medium-landscape', { width: 900, height: 600 }, THRESHOLDS)).toBe(true);
  });

  it('fails-safe (unmet) for a bucket this driver does not know', () => {
    // e.g. a bucket added by a newer schema — must skip, never match
    expect(matchesResponsive('expanded' as never, { width: 1280, height: 800 }, THRESHOLDS)).toBe(false);
  });
});

describe('matchesResponsive - constraint objects', () => {
  const size = { width: 768, height: 1024 };

  it('treats minWidth/maxWidth as inclusive', () => {
    expect(matchesResponsive({ minWidth: 768 }, size, THRESHOLDS)).toBe(true);
    expect(matchesResponsive({ minWidth: 769 }, size, THRESHOLDS)).toBe(false);
    expect(matchesResponsive({ maxWidth: 768 }, size, THRESHOLDS)).toBe(true);
    expect(matchesResponsive({ maxWidth: 767 }, size, THRESHOLDS)).toBe(false);
  });

  it('treats minHeight/maxHeight as inclusive', () => {
    expect(matchesResponsive({ minHeight: 1024 }, size, THRESHOLDS)).toBe(true);
    expect(matchesResponsive({ minHeight: 1025 }, size, THRESHOLDS)).toBe(false);
    expect(matchesResponsive({ maxHeight: 1024 }, size, THRESHOLDS)).toBe(true);
    expect(matchesResponsive({ maxHeight: 1023 }, size, THRESHOLDS)).toBe(false);
  });

  it('compares orientation to the derived orientation', () => {
    expect(matchesResponsive({ orientation: 'portrait' }, size, THRESHOLDS)).toBe(true);
    expect(matchesResponsive({ orientation: 'landscape' }, size, THRESHOLDS)).toBe(false);
    expect(matchesResponsive({ orientation: 'landscape' }, { width: 1024, height: 768 }, THRESHOLDS)).toBe(true);
  });

  it('ANDs all present keys', () => {
    expect(
      matchesResponsive(
        { minWidth: 768, maxWidth: 1024, orientation: 'portrait' },
        size,
        THRESHOLDS
      )
    ).toBe(true);
    expect(
      matchesResponsive(
        { minWidth: 768, maxWidth: 1024, orientation: 'landscape' },
        size,
        THRESHOLDS
      )
    ).toBe(false);
    expect(matchesResponsive({ minWidth: 768, maxWidth: 700 }, size, THRESHOLDS)).toBe(false);
  });
});

describe('resolveViewportSize', () => {
  it('uses page.viewportSize() when a viewport is set', async () => {
    const evaluate = jest.fn();
    const page: ViewportSource = {
      viewportSize: () => ({ width: 800, height: 600 }),
      evaluate
    };
    await expect(resolveViewportSize(page)).resolves.toEqual({ width: 800, height: 600 });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('falls back to window.innerWidth/innerHeight for viewport: null contexts', async () => {
    const page: ViewportSource = {
      viewportSize: () => null,
      evaluate: <R>(_fn: () => R) => Promise.resolve({ width: 1440, height: 900 } as R)
    };
    await expect(resolveViewportSize(page)).resolves.toEqual({ width: 1440, height: 900 });
  });
});

describe('unknownConditionKeys', () => {
  it('returns empty for the known key set', () => {
    const condition: WhenCondition = {
      visible: 'a',
      notVisible: 'b',
      platform: 'web',
      responsive: 'compact',
      state: { path: 'x', equals: 1 }
    };
    expect(unknownConditionKeys(condition)).toEqual([]);
  });

  it('reports keys this driver does not understand', () => {
    const condition = { platform: 'web', someFutureGate: true } as WhenCondition;
    expect(unknownConditionKeys(condition)).toEqual(['someFutureGate']);
  });
});
