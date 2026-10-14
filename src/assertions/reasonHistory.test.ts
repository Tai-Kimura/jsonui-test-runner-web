import { Page } from 'playwright';
import { AssertionExecutor } from './AssertionExecutor';
import { ReasonHistory, renderBlock, MAX_SEGMENTS } from './reasonHistory';

const notInViewport = "Element 'stand' should be visible but it is not in the viewport";
const doesNotExist = "Element 'stand' should be visible but it does not exist";

describe('ReasonHistory', () => {
  it('one reason, however many looks: the message is the last reason, byte for byte', () => {
    const h = new ReasonHistory();
    for (let t = 0; t <= 5000; t += 100) h.observe(doesNotExist, t);
    expect(h.message(doesNotExist, 5000)).toBe(doesNotExist);
  });

  it('a reason that changed: the last stays the first line, the block lists both in order with their spans', () => {
    const h = new ReasonHistory();
    for (let t = 0; t < 2100; t += 100) h.observe(notInViewport, t);
    for (let t = 2100; t <= 5000; t += 100) h.observe(doesNotExist, t);
    expect(h.message(doesNotExist, 5000)).toBe(
      [
        doesNotExist,
        '  waited 5.0s; the reason changed while waiting:',
        '    0.0–2.1s  should be visible but it is not in the viewport',
        '    2.1–5.0s  should be visible but it does not exist'
      ].join('\n')
    );
  });

  it('A → B → A stays three segments: a round trip is not folded away', () => {
    const h = new ReasonHistory();
    h.observe('A', 0);
    h.observe('B', 100);
    h.observe('B', 200);
    h.observe('A', 300);
    expect(h.all.map((s) => s.reason)).toEqual(['A', 'B', 'A']);
  });

  it('folds on the first line: a reason whose detail lines differ every look is one segment', () => {
    const h = new ReasonHistory();
    h.observe('not found\n  probe 1', 0);
    h.observe('not found\n  probe 2', 100);
    expect(h.all).toEqual([{ reason: 'not found', startMs: 0 }]);
  });

  it(`more than ${MAX_SEGMENTS} segments: the first 3 and the last 4 are kept, the middle is counted`, () => {
    const at = (n: number) => Array.from({ length: n }, (_, i) => ({ reason: `r${i}`, startMs: i * 100 }));
    const exactly = renderBlock(at(MAX_SEGMENTS), 1000).split('\n');
    expect(exactly).toHaveLength(1 + MAX_SEGMENTS); // control: at the cap nothing is elided
    const over = renderBlock(at(MAX_SEGMENTS + 1), 1000).split('\n');
    expect(over).toEqual([
      '  waited 1.0s; the reason changed while waiting:',
      '    0.0–0.1s  r0',
      '    0.1–0.2s  r1',
      '    0.2–0.3s  r2',
      '    … 2 more',
      '    0.5–0.6s  r5',
      '    0.6–0.7s  r6',
      '    0.7–0.8s  r7',
      '    0.8–1.0s  r8'
    ]);
  });

  it('a row only drops the leading element subject, never a reason without one', () => {
    expect(renderBlock([{ reason: "State 'a' should be 1 but got 2", startMs: 0 }, { reason: 'x', startMs: 1 }], 2))
      .toContain("    0.0–0.0s  State 'a' should be 1 but got 2");
  });
});

/**
 * The executor end of it, against a fake Page whose element is in the
 * viewport-less state, then gone — the reported sequence. Time is the fake's
 * own: waitForTimeout advances Date.now.
 */
describe('AssertionExecutor pollUntil', () => {
  let now = 0;
  let spy: jest.SpyInstance;
  beforeEach(() => {
    now = 1_000_000;
    spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => spy.mockRestore());

  function pageWhoseElementLeavesAt(goneAtMs: number): Page {
    const start = now;
    const exists = () => now - start < goneAtMs;
    const locator = {
      count: async () => (exists() ? 1 : 0),
      first: () => locator,
      // isInViewport reads the element's box and its clipping ancestors:
      // below the fold of the window.
      evaluate: async () => ({ rect: { left: 0, top: 900, right: 100, bottom: 920 }, clips: [{ left: 0, top: 0, right: 1280, bottom: 720 }] }),
      boundingBox: async () => ({ x: 0, y: 900, width: 100, height: 20 }),
      isVisible: async () => true
    };
    const page = {
      locator: () => locator,
      waitForTimeout: async (ms: number) => {
        now += ms;
      },
      viewportSize: () => ({ width: 1280, height: 720 }),
      evaluate: async () => ({ width: 1280, height: 720 })
    };
    return page as unknown as Page;
  }

  it('visible: below the fold, then removed — the failure names both, in order', async () => {
    const executor = new AssertionExecutor(pageWhoseElementLeavesAt(2100));
    const failure = executor.execute({ assert: 'visible', id: 'stand', timeout: 5000 });
    await expect(failure).rejects.toThrow(
      new RegExp(
        "^Element 'stand' should be visible but it does not exist\n" +
          '  waited 5\\.0s; the reason changed while waiting:\n' +
          '    0\\.0–2\\.1s  should be visible but it is not in the viewport\n' +
          '    2\\.1–5\\.0s  should be visible but it does not exist$'
      )
    );
  });

  it('visible: absent the whole time — the message is what it always was', async () => {
    const executor = new AssertionExecutor(pageWhoseElementLeavesAt(0));
    await expect(executor.execute({ assert: 'visible', id: 'stand', timeout: 5000 })).rejects.toThrow(
      /^Element 'stand' should be visible but it does not exist$/
    );
  });
});
