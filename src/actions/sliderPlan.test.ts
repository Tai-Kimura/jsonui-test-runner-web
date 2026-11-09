import { neighbours, onGrid, readRangeAttributes, refusal, show } from './sliderPlan';

describe('sliderPlan', () => {
  it('reads the attributes with the browser\'s defaults: min 0, max 100, step 1, "any" continuous', () => {
    expect(readRangeAttributes(null, null, null)).toEqual({ min: 0, max: 100, step: 1 });
    expect(readRangeAttributes('1', '10', 'any')).toEqual({ min: 1, max: 10, step: null });
    expect(readRangeAttributes('-5', '5', '0')).toEqual({ min: -5, max: 5, step: 1 });
    expect(readRangeAttributes('0', '1', 'ANY')).toEqual({ min: 0, max: 1, step: null });
  });

  it('the grid starts at the minimum; neighbours stay inside the bounds', () => {
    expect(onGrid(0.3, 0, 0.1)).toBe(true);
    expect(onGrid(2, 1, 0.5)).toBe(true);
    expect(onGrid(1.25, 1, 0.5)).toBe(false);
    expect(neighbours(9.4, { min: 1, max: 10, step: 1 }, 1)).toEqual([9, 10]);
    expect(neighbours(9.9, { min: 1, max: 9.5, step: 2 }, 2)).toEqual([9, 9.5]);
    expect(show(0.1 + 0.2)).toBe('0.3');
  });

  it('the value at either bound passes; a continuous slider has no grid', () => {
    const input = { min: 1, max: 10, step: null };
    expect(refusal('s', input, { value: 1 })).toBeNull();
    expect(refusal('s', input, { value: 10 })).toBeNull();
    expect(refusal('s', input, { value: 5.123456 })).toBeNull();
    expect(refusal('s', input, { value: NaN })).toContain('not a number');
  });
});
