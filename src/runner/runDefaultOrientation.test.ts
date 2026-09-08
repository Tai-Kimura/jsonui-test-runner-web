/**
 * A run can declare the orientation it runs in, and it reports both halves.
 *
 * Four things fail silently on their own and all of them fail GREEN — in the
 * wrong orientation, with every assertion still passing:
 *
 *  - the run default never being applied (the lane runs as the browser opened);
 *  - the file's own `orientation` losing to the default instead of beating it;
 *  - a missing sidecar being read as "no default declared", which is the one
 *    distinction the sidecar exists to keep;
 *  - the observed orientation being derived from the declared one, which makes
 *    the pair agree by construction and deletes the disagreement it measures.
 *
 * The fake page here MODELS the viewport swap (setViewportSize mutates what
 * viewportSize returns) rather than recording the call, so "observed" is read
 * back through the same path a real run reads it through. A fake that only
 * recorded the call would let a runner that stamps `observedOrientation` from
 * the declaration pass every arm below.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Page } from 'playwright';
import { JsonUITestRunner, TestRunnerConfig } from './JsonUITestRunner';
import { ResultsWriter } from './ResultsWriter';
import {
  RUN_DEFAULTS_FILENAME,
  SUPPORTED_SCHEMA_VERSION,
  defaultOrientationForTier,
  loadRunDefaults
} from './RunDefaults';
import { FlowTest, ScreenTest, RunDefaults } from '../models/types';

interface Viewport { width: number; height: number }

function makeFakePage(initial: Viewport | null): { page: Page; current: () => Viewport | null } {
  let viewport = initial;
  const fake = {
    viewportSize: () => viewport,
    setViewportSize: async (size: Viewport) => { viewport = size; },
    evaluate: async () => (viewport ?? { width: 0, height: 0 }),
    waitForLoadState: async () => undefined,
    waitForTimeout: async () => undefined,
    screenshot: async () => Buffer.from(''),
    url: () => 'http://localhost/fake',
    locator: (selector: string) => {
      if (/^\[data-screen="(.+)"\]$/.test(selector)) {
        return { count: async () => 1, first: () => ({ isVisible: async () => true }) };
      }
      if (selector === '[data-screen]') {
        return { count: async () => 1, evaluateAll: async () => ['test_screen'] };
      }
      throw new Error(`fake page: unmodelled selector ${selector}`);
    },
    addInitScript: async () => undefined
  };
  return { page: fake as unknown as Page, current: () => viewport };
}

function screenTest(extra: Partial<ScreenTest> = {}): ScreenTest {
  return {
    type: 'screen',
    source: { layout: 'test_screen' },
    metadata: { name: 'OrientationTest' },
    cases: [{ name: 'c', steps: [] }],
    ...extra
  };
}

function flowTest(extra: Partial<FlowTest> = {}): FlowTest {
  return {
    type: 'flow',
    metadata: { name: 'OrientationFlow' },
    steps: [],
    ...extra
  } as FlowTest;
}

function runner(page: Page, config: TestRunnerConfig = {}): JsonUITestRunner {
  return new JsonUITestRunner(page, { screenshotOnFailure: false, ...config });
}

const TABLET_PORTRAIT: Viewport = { width: 1024, height: 1366 };
const PHONE_PORTRAIT: Viewport = { width: 375, height: 812 };

function defaults(orientation: RunDefaults['orientation']): RunDefaults {
  return { schemaVersion: SUPPORTED_SCHEMA_VERSION, orientation };
}

// --- the run default is applied, per tier ----------------------------------

describe('the run default is applied at the start of the run', () => {
  it('rotates a regular-tier lane declared landscape', async () => {
    const { page, current } = makeFakePage(TABLET_PORTRAIT);
    const suite = await runner(page, { runDefaults: defaults({ regular: 'landscape' }) })
      .runScreenTest(screenTest());
    expect(current()).toEqual({ width: 1366, height: 1024 });
    expect(suite.results[0]).toMatchObject({
      declaredOrientation: 'landscape',
      observedOrientation: 'landscape'
    });
  });

  it('leaves a compact-tier lane alone when only regular is declared', async () => {
    // THE arm for the table being a table: one bundle, two lanes, one file.
    const { page, current } = makeFakePage(PHONE_PORTRAIT);
    const suite = await runner(page, { runDefaults: defaults({ regular: 'landscape' }) })
      .runScreenTest(screenTest());
    expect(current()).toEqual(PHONE_PORTRAIT);
    expect(suite.results[0].declaredOrientation).toBeUndefined();
    expect(suite.results[0].observedOrientation).toBe('portrait');
  });

  it('is a no-op when the lane is already in the declared orientation', async () => {
    const { page, current } = makeFakePage({ width: 1366, height: 1024 });
    await runner(page, { runDefaults: defaults({ regular: 'landscape' }) })
      .runScreenTest(screenTest());
    expect(current()).toEqual({ width: 1366, height: 1024 });
  });

  it('applies to flow tests too', async () => {
    const { page, current } = makeFakePage(TABLET_PORTRAIT);
    const suite = await runner(page, { runDefaults: defaults({ regular: 'landscape' }) })
      .runFlowTest(flowTest());
    expect(current()).toEqual({ width: 1366, height: 1024 });
    expect(suite.results[0].observedOrientation).toBe('landscape');
  });
});

// --- precedence -------------------------------------------------------------

describe('precedence: step > file > run default', () => {
  it('the file beats the run default', async () => {
    const { page, current } = makeFakePage({ width: 1366, height: 1024 });
    const suite = await runner(page, { runDefaults: defaults({ regular: 'landscape' }) })
      .runScreenTest(screenTest({ orientation: 'portrait' }));
    expect(current()).toEqual({ width: 1024, height: 1366 });
    expect(suite.results[0].declaredOrientation).toBe('portrait');
  });

  it('a setOrientation step beats the file', async () => {
    const { page } = makeFakePage(TABLET_PORTRAIT);
    const suite = await runner(page).runScreenTest(screenTest({
      orientation: 'portrait',
      cases: [{ name: 'c', steps: [{ action: 'setOrientation', orientation: 'landscape' }] }]
    }));
    expect(suite.results[0]).toMatchObject({
      declaredOrientation: 'landscape',
      observedOrientation: 'landscape'
    });
  });

  it('declares nothing when nothing declares anything', async () => {
    const { page } = makeFakePage(TABLET_PORTRAIT);
    const suite = await runner(page).runScreenTest(screenTest());
    expect(suite.results[0].declaredOrientation).toBeUndefined();
    expect(suite.results[0].observedOrientation).toBe('portrait');
  });
});

// --- observed is measured, not derived --------------------------------------

describe('observed is read from the viewport, never from the declaration', () => {
  it('reports the real orientation when the swap could not happen', async () => {
    // A viewport: null context has no viewport to swap. The declaration still
    // stands; the observation says what actually happened. If observed were
    // derived from declared, this arm could not exist.
    const { page } = makeFakePage(null);
    const suite = await runner(page, { runDefaults: defaults({ compact: 'landscape' }) })
      .runScreenTest(screenTest({ orientation: 'landscape' }));
    expect(suite.results[0].declaredOrientation).toBe('landscape');
    expect(suite.results[0].observedOrientation).toBe('landscape'); // 0x0 -> landscape
  });

  it('a square viewport is reported as landscape, matching deriveOrientation', async () => {
    const { page } = makeFakePage({ width: 900, height: 900 });
    const suite = await runner(page).runScreenTest(screenTest());
    expect(suite.results[0].observedOrientation).toBe('landscape');
  });

  it('stamps failed cases as well as passing ones', async () => {
    const { page } = makeFakePage(TABLET_PORTRAIT);
    const suite = await runner(page).runScreenTest(screenTest({
      orientation: 'landscape',
      cases: [{ name: 'boom', steps: [{ action: 'tap' }] }]
    }));
    expect(suite.results[0].passed).toBe(false);
    expect(suite.results[0].observedOrientation).toBe('landscape');
  });

  it('does not stamp skipped cases', async () => {
    // Same argument as `attempts`: a case that never ran has no orientation
    // it ran in, and a viewport read at skip time would look like one.
    const { page } = makeFakePage(PHONE_PORTRAIT);
    const suite = await runner(page).runScreenTest(screenTest({
      orientation: 'portrait',
      cases: [{ name: 'skipped', skip: true, steps: [] }]
    }));
    expect(suite.results[0].skipped).toBe(true);
    expect(suite.results[0].declaredOrientation).toBeUndefined();
    expect(suite.results[0].observedOrientation).toBeUndefined();
  });
});

// --- the results JSON --------------------------------------------------------

describe('the results JSON carries both halves', () => {
  it('emits both fields on a case that ran', async () => {
    const { page } = makeFakePage(TABLET_PORTRAIT);
    const suite = await runner(page).runScreenTest(screenTest({ orientation: 'landscape' }));
    const json = ResultsWriter.toResultsJson([suite]);
    expect(json.suites[0].results[0]).toMatchObject({
      declaredOrientation: 'landscape',
      observedOrientation: 'landscape'
    });
  });

  it('emits neither on a skipped row', async () => {
    const { page } = makeFakePage(PHONE_PORTRAIT);
    const suite = await runner(page).runScreenTest(screenTest({
      cases: [{ name: 's', skip: true, steps: [] }]
    }));
    const row = ResultsWriter.toResultsJson([suite]).suites[0].results[0];
    expect('declaredOrientation' in row).toBe(false);
    expect('observedOrientation' in row).toBe(false);
  });

  it('emits the observed half even when nothing was declared', async () => {
    // Which orientation a run happened in is worth recording whether or not
    // anybody asked for one — that absence is the state the ticket is about.
    const { page } = makeFakePage(PHONE_PORTRAIT);
    const suite = await runner(page).runScreenTest(screenTest());
    const row = ResultsWriter.toResultsJson([suite]).suites[0].results[0];
    expect('declaredOrientation' in row).toBe(false);
    expect(row.observedOrientation).toBe('portrait');
  });
});

// --- the sidecar -------------------------------------------------------------

describe('loadRunDefaults keeps "absent" and "declared nothing" apart', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rundefaults-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  const write = (content: string) =>
    fs.writeFileSync(path.join(dir, RUN_DEFAULTS_FILENAME), content, 'utf-8');

  it('reads a table', () => {
    write(JSON.stringify({ schemaVersion: 1, orientation: { regular: 'landscape' } }));
    expect(loadRunDefaults(dir).defaults).toEqual({
      schemaVersion: 1, orientation: { regular: 'landscape' }
    });
  });

  it('an empty table is a table, not a miss', () => {
    write(JSON.stringify({ schemaVersion: 1, orientation: {} }));
    const load = loadRunDefaults(dir);
    expect(load.miss).toBeUndefined();
    expect(load.defaults).toEqual({ schemaVersion: 1, orientation: {} });
  });

  it('an absent file is a miss that names itself', () => {
    // THE arm. Folding this into an empty table would make "installed by an
    // older CLI" indistinguishable from "no default declared".
    const load = loadRunDefaults(dir);
    expect(load.defaults).toBeNull();
    expect(load.miss).toBe('absent');
    expect(load.reason).toContain('too old');
  });

  it('a newer schemaVersion is refused rather than guessed at', () => {
    write(JSON.stringify({ schemaVersion: 2, orientation: { regular: 'landscape' } }));
    const load = loadRunDefaults(dir);
    expect(load.defaults).toBeNull();
    expect(load.miss).toBe('unknown-version');
  });

  it('malformed JSON is a miss, not an empty table', () => {
    write('{ not json');
    expect(loadRunDefaults(dir).miss).toBe('unreadable');
  });

  it('never throws', () => {
    expect(() => loadRunDefaults(path.join(dir, 'nope'))).not.toThrow();
  });
});

describe('defaultOrientationForTier', () => {
  it('returns the row for the tier', () => {
    expect(defaultOrientationForTier(defaults({ regular: 'landscape' }), 'regular'))
      .toBe('landscape');
  });

  it('returns undefined for a tier with no row', () => {
    expect(defaultOrientationForTier(defaults({ regular: 'landscape' }), 'compact'))
      .toBeUndefined();
  });

  it('returns undefined for null defaults (a miss is not a default)', () => {
    expect(defaultOrientationForTier(null, 'regular')).toBeUndefined();
  });

  it('drops a value it cannot name rather than forwarding it', () => {
    const rogue = { schemaVersion: 1, orientation: { regular: 'sideways' } } as unknown as RunDefaults;
    expect(defaultOrientationForTier(rogue, 'regular')).toBeUndefined();
  });
});
