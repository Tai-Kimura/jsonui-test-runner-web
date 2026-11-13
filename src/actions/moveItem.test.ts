/**
 * moveItem's gesture plan against jsonui-test-runner specs/vectors/move-item.json
 * (copied into test-fixtures/vectors): where the press and the release land, and
 * the reason a step fails before anything moves.
 */
import * as fs from 'fs';
import * as path from 'path';
import { planMoveItem, scrolledDuring, scrolledSentence, MOVE_ITEM_TIMING, MOVE_ITEM_EDGE_MARGIN, MOVE_ITEM_LIST_MARGIN, Rect } from './moveItem';

const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, '../../test-fixtures/vectors/move-item.json'), 'utf8'));

describe('moveItem plan (shared vectors)', () => {
  it('uses the vectors timing and edge margin', () => {
    expect(MOVE_ITEM_TIMING).toEqual(vectors.timing);
    expect(MOVE_ITEM_EDGE_MARGIN).toBe(vectors.edgeMargin);
    expect(MOVE_ITEM_LIST_MARGIN).toBe(vectors.listMargin);
  });

  for (const c of vectors.cases) {
    it(c.name, () => {
      const got = planMoveItem({
        viewport: c.viewport as Rect, from: c.from, to: c.to, section: c.section,
        rows: c.rows as Record<string, Rect[]>, id: 'list',
        ...('handle' in c ? { handle: c.handle as Rect | null } : {}),
        ...('list' in c ? { list: c.list as Rect } : {}),
        ...('canScrollUp' in c ? { canScrollUp: c.canScrollUp } : {}),
        ...('canScrollDown' in c ? { canScrollDown: c.canScrollDown } : {}),
      });
      expect(got).toEqual('fail' in c ? { fail: c.fail } : { press: c.press, release: c.release });
    });
  }
});

describe('moveItem verify (shared vectors)', () => {
  for (const w of vectors.verify) {
    it(w.name, () => {
      const moved = scrolledDuring(w.before as Rect, w.after as Rect | null);
      expect(moved !== null).toBe(w.scrolled);
      if (w.offScreen) expect(scrolledSentence('list_item_1', moved as number)).toContain("('list_item_1' moved off the screen)");
    });
  }
});
