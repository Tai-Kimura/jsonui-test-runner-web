/**
 * The shared vectors in test-fixtures/vectors/ are byte copies of
 * jsonui-test-runner's specs/vectors/. The source is looked for where it
 * sits: this driver as the parent's submodule (drivers/web -> ../../specs),
 * a sibling checkout (../jsonui-test-runner), or JSONUI_TEST_RUNNER_DIR. Not
 * finding it is a failure, not a skip: a copy nobody compares drifts.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../..');
const NAMES = ['initial-state-payload.json', 'initial-state-coercion.json', 'state-path.json', 'results-prune.json'];

function sourceDir(): string | null {
  const candidates = [
    process.env.JSONUI_TEST_RUNNER_DIR && path.join(process.env.JSONUI_TEST_RUNNER_DIR, 'specs/vectors'),
    path.join(ROOT, '../../specs/vectors'),
    path.join(ROOT, '../jsonui-test-runner/specs/vectors')
  ].filter((c): c is string => !!c);
  return candidates.find(c => NAMES.every(n => fs.existsSync(path.join(c, n)))) ?? null;
}

describe('shared vectors', () => {
  const dir = sourceDir();

  it('finds the jsonui-test-runner specs/vectors to compare with', () => {
    expect(dir).not.toBeNull();
  });

  for (const name of NAMES) {
    it(`${name} is byte-equal to the source`, () => {
      const copy = fs.readFileSync(path.join(ROOT, 'test-fixtures/vectors', name));
      const source = fs.readFileSync(path.join(dir as string, name));
      expect(copy.equals(source)).toBe(true);
    });
  }
});
