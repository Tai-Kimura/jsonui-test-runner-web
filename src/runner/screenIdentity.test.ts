/**
 * The mirrored screen-id rule must stay equal to the canonical one.
 *
 * `screenIdFromLayout` is a second implementation of
 * `JsonUIShared::ScreenIndex.screen_id_for_path` (jsonui-cli
 * `shared/core/screen_index.rb`, which delegates the variant half to
 * `LayoutVariant.split`). The driver ships as an npm package and cannot
 * import the Ruby tooling, so the duplication is unavoidable — but a second
 * implementation is only allowed to exist if drifting from the canon turns
 * something red. These vectors are that gate: each one states what the Ruby
 * rule returns, so changing this function to "something reasonable" fails
 * here instead of silently waiting for a marker no page will ever carry.
 *
 * Canon, in order:
 *   stem = File.basename(path)
 *   stem = stem[0...-'.json'.length] if stem.end_with?('.json')
 *   LayoutVariant.split(stem).first   # everything before the LAST '@'
 */

import { screenIdFromLayout } from './screenIdentity';

describe('screenIdFromLayout mirrors ScreenIndex.screen_id_for_path', () => {
  const vectors: Array<[string, string | null]> = [
    // basename + extension
    ['order_detail.json', 'order_detail'],
    ['docs/user/screens/layouts/order_detail.json', 'order_detail'],
    ['../../../docs/user/screens/layouts/catalog_page.json', 'catalog_page'],
    // the extension is optional in the canon (`if stem.end_with?`)
    ['test_screen', 'test_screen'],
    // size variants resolve to the screen they vary — the generator emits
    // ONE marker for a layout and its variants
    ['home@compact.json', 'home'],
    ['home@regular', 'home'],
    // LAST '@', not the first: the canon uses rindex
    ['odd@name@compact.json', 'odd@name'],
    // a name that is only a variant suffix has no screen id
    ['@compact.json', null],
    // nothing to derive
    ['', null]
  ];

  it.each(vectors)('%s -> %s', (layout, expected) => {
    expect(screenIdFromLayout(layout)).toBe(expected);
  });

  it('treats a missing layout as "no id" rather than throwing', () => {
    // The caller uses null to choose the networkidle fallback; an exception
    // here would turn a hand-written page into a crash.
    expect(screenIdFromLayout(undefined)).toBeNull();
    expect(screenIdFromLayout(null)).toBeNull();
  });

  it('handles windows separators', () => {
    expect(screenIdFromLayout('docs\\screens\\layouts\\auth.json')).toBe('auth');
  });
});

describe('the shape a real corpus has', () => {
  /**
   * Measured against a consumer project, restated in neutral names.
   *
   * Every variant test file there points at the BASE layout, and the
   * generated component carries the base id. So deriving the id from the
   * test FILE name (`auth--register.test.json`) picks a marker no page
   * carries, while deriving it from `source.layout` (`auth.json`) matches
   * the `screenMarker("auth")` the generator emitted. The variant lives in
   * the test file's name, never in the layout it points at.
   */
  it.each([
    ['auth.json', 'auth'],                        // from auth--register.test.json
    ['order_detail.json', 'order_detail'],        // from order_detail--variant.test.json
    ['profile_settings.json', 'profile_settings'] // from profile_settings--child.test.json
  ])('%s -> %s', (layout, expected) => {
    expect(screenIdFromLayout(layout)).toBe(expected);
  });
});
