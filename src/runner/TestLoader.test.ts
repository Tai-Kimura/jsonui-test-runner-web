/**
 * File-reference resolution in a flow: the base the references resolve
 * against is the FLOW file's directory, and reading a referenced screen
 * test must not move it.
 *
 * Before the fix, `loadFromFile` set the static `basePath` unconditionally,
 * so the first `file:` reference moved the base to `screens/<first>/` and
 * the second reference (a different screen) looked under
 * `screens/screens/<second>/` and was "not found". Referencing the SAME
 * screen twice passed by accident — `<base>/<ref>.test.json` happened to
 * exist — which is why the defect stayed invisible until a flow crossed
 * two screens.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TestLoader } from './TestLoader';

function screenTest(name: string): string {
  return JSON.stringify({
    type: 'screen',
    source: { layout: `layouts/${name}.json` },
    metadata: { name },
    cases: [{ name: 'initial_display', steps: [] }]
  });
}

function flowTest(): string {
  return JSON.stringify({
    type: 'flow',
    metadata: { name: 'two screens' },
    steps: [
      { file: 'alpha', case: 'initial_display' },
      { file: 'beta', case: 'initial_display' }
    ]
  });
}

describe('TestLoader file references resolve against the flow directory', () => {
  let root: string;
  let flowPath: string;
  let alphaPath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'jtr-basepath-'));
    const flows = path.join(root, 'tests', 'flows');
    const alpha = path.join(root, 'tests', 'screens', 'alpha');
    const beta = path.join(root, 'tests', 'screens', 'beta');
    for (const d of [flows, alpha, beta]) fs.mkdirSync(d, { recursive: true });
    flowPath = path.join(flows, 'two.test.json');
    alphaPath = path.join(alpha, 'alpha.test.json');
    fs.writeFileSync(flowPath, flowTest());
    fs.writeFileSync(alphaPath, screenTest('alpha'));
    fs.writeFileSync(path.join(beta, 'beta.test.json'), screenTest('beta'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // The reported shape: two DIFFERENT screens, in either order.
  it('resolves a second, different screen after the first one was read', () => {
    TestLoader.setBasePath(flowPath);
    expect(TestLoader.resolveFileReference('alpha').metadata.name).toBe('alpha');
    expect(TestLoader.resolveFileReference('beta').metadata.name).toBe('beta');

    TestLoader.setBasePath(flowPath);
    expect(TestLoader.resolveFileReference('beta').metadata.name).toBe('beta');
    expect(TestLoader.resolveFileReference('alpha').metadata.name).toBe('alpha');
  });

  // The form that passed before the fix — by accident — has to keep passing.
  it('still resolves the same screen referenced twice', () => {
    TestLoader.setBasePath(flowPath);
    expect(TestLoader.resolveFileReference('alpha').metadata.name).toBe('alpha');
    expect(TestLoader.resolveFileReference('alpha').metadata.name).toBe('alpha');
  });

  // The invariant itself, stated directly: reading a reference is not a load.
  it('leaves the base at the flow directory after resolving references', () => {
    TestLoader.setBasePath(flowPath);
    TestLoader.resolveFileReference('alpha');
    expect(TestLoader.getBasePath()).toBe(path.dirname(flowPath));
  });

  // The step-level entry the runner actually calls.
  it('resolves every file step of a two-screen flow through resolveFileReferenceCases', () => {
    TestLoader.setBasePath(flowPath);
    const flow = TestLoader.loadFromFile(flowPath);
    expect(flow.type).toBe('flow');
    if (flow.type !== 'flow') return;
    const names = flow.test.steps.flatMap((step) =>
      TestLoader.resolveFileReferenceCases(step).map((c) => c.name)
    );
    expect(names).toEqual(['initial_display', 'initial_display']);
  });

  // Negative control: the resolver still refuses to guess a base.
  it('refuses to resolve when no base has been set', () => {
    // A fresh base is set by every loadFromFile, so clear it the only way the
    // public surface allows: via a loader that owns no directory.
    (TestLoader as unknown as { basePath: string | null }).basePath = null;
    expect(() => TestLoader.resolveFileReference('alpha')).toThrow(/Base path not set/);
  });

  // A TOP-LEVEL load still owns the base — a screen test run on its own
  // resolves its step-level relative paths against its own directory.
  it('moves the base on a top-level loadFromFile', () => {
    TestLoader.setBasePath(flowPath);
    TestLoader.loadFromFile(alphaPath);
    expect(TestLoader.getBasePath()).toBe(path.dirname(alphaPath));
  });
});
