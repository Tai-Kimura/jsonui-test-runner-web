/**
 * A referenced case run with args is rebuilt step by step (TestLoader.substituteArgsInStep): every field is carried
 * (the rebuild spreads the step), and an id-like field is substituted — moveItem's handle as id and within are, as
 * the iOS driver does. The iOS rebuilds named their fields one by one and dropped setSliderValue's range, step and
 * tolerance until 2.4.0; this pins that the web keeps them.
 */
import { TestLoader } from './TestLoader';
import { TestStep } from '../models/types';

const substitute = (step: TestStep, args: Record<string, unknown>): TestStep =>
  (TestLoader as unknown as { substituteArgsInStep(s: TestStep, a: Record<string, unknown>): TestStep })
    .substituteArgsInStep(step, args);

describe('args substitution keeps every field', () => {
  it('keeps a slider step\'s range, step and tolerance', () => {
    const got = substitute({ action: 'setSliderValue', id: '@{which}', value: '9', range: [1, 10], step: 1, tolerance: 0.5 } as TestStep,
      { which: 'rating' });
    expect(got).toMatchObject({ id: 'rating', range: [1, 10], step: 1, tolerance: 0.5 });
  });

  it('keeps moveItem\'s rows and substitutes its handle', () => {
    const got = substitute({ action: 'moveItem', id: 'stops_@{which}', from: 1, to: 3, section: 0, handle: 'grip_@{which}' } as TestStep,
      { which: 'a' });
    expect(got).toMatchObject({ id: 'stops_a', from: 1, to: 3, section: 0, handle: 'grip_a' });
  });
});
