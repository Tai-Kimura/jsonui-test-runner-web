/**
 * moveItem's gesture plan against jsonui-test-runner specs/vectors/move-item.json
 * (copied into test-fixtures/vectors): where the press and the release land, and
 * the reason a step fails before anything moves.
 */
import * as fs from 'fs';
import * as path from 'path';
import { planMoveItem, MOVE_ITEM_TIMING, MOVE_ITEM_EDGE_MARGIN, Rect } from './moveItem';

const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, '../../test-fixtures/vectors/move-item.json'), 'utf8'));

describe('moveItem plan (shared vectors)', () => {
  it('uses the vectors timing and edge margin', () => {
    expect(MOVE_ITEM_TIMING).toEqual(vectors.timing);
    expect(MOVE_ITEM_EDGE_MARGIN).toBe(vectors.edgeMargin);
  });

  for (const c of vectors.cases) {
    it(c.name, () => {
      const got = planMoveItem({
        viewport: c.viewport as Rect, from: c.from, to: c.to, section: c.section,
        rows: c.rows as Record<string, Rect[]>, id: 'list',
        ...('handle' in c ? { handle: c.handle as Rect | null } : {}),
      });
      expect(got).toEqual('fail' in c ? { fail: c.fail } : { press: c.press, release: c.release });
    });
  }
});
