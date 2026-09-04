import { classifyFailure } from './failureReason';
import { CaseNotFoundError, NotAScreenTestError } from './TestLoader';
import { ResultsWriter } from './ResultsWriter';
import { TestSuiteResult } from '../models/types';

/**
 * `failureReason` (results.schema.json): the machine-readable half of a
 * failed row, beside the prose in `error`. Prose moves between releases — a
 * consumer aggregation matched on a sentence another driver deleted, and
 * would have reported zero occurrences of a thing only reworded.
 */
describe('classifyFailure', () => {
  it('maps the two named error classes to a stage', () => {
    expect(classifyFailure(new CaseNotFoundError('c', 'f.json'))).toBe('invalid-test');
    expect(classifyFailure(new NotAScreenTestError('f.json'))).toBe('invalid-test');
  });

  it('is undefined when there is nothing to classify', () => {
    // undefined means "unknown"; 'other' means "a failure we could not name".
    // Collapsing them would turn unknown into unclassified.
    expect(classifyFailure(undefined)).toBeUndefined();
    expect(classifyFailure(null)).toBeUndefined();
  });

  it('falls back to other for the bare Errors this driver mostly throws', () => {
    // 80 throw sites raise a bare Error, so the type carries no stage. This
    // is the honest answer, and a rising 'other' count is the signal to give
    // those sites named classes.
    expect(classifyFailure(new Error('anything'))).toBe('other');
  });
});

describe('ResultsWriter failureReason emission', () => {
  const suite = (results: TestSuiteResult['results']): TestSuiteResult => ({
    suiteName: 's', totalDurationMs: 0, results
  });

  it('emits it on failed rows only', () => {
    // The classifier being right does not mean the writer prints it.
    const json = ResultsWriter.toResultsJson([suite([
      { testName: 't', caseName: 'failed', passed: false, error: 'boom',
        failureReason: 'teardown', durationMs: 0 },
      { testName: 't', caseName: 'passed', passed: true, durationMs: 0 },
      { testName: 't', caseName: 'skipped', passed: true, skipped: true,
        skipReason: 'platform', failureReason: 'teardown', durationMs: 0 },
    ])]);
    const rows = json.suites[0].results;
    expect(rows[0].failureReason).toBe('teardown');
    expect(rows[1].failureReason).toBeUndefined();
    // Set on the model but not a failure: withheld, because the validator
    // rejects it on a skipped row.
    expect(rows[2].failureReason).toBeUndefined();
  });

  it('omits it on a failure that carries none', () => {
    const json = ResultsWriter.toResultsJson([suite([
      { testName: 't', caseName: 'bare', passed: false, error: 'x', durationMs: 0 },
    ])]);
    expect(json.suites[0].results[0].status).toBe('failed');
    expect(json.suites[0].results[0].failureReason).toBeUndefined();
  });
});
