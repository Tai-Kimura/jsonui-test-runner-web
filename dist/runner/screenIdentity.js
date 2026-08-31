"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.screenIdFromLayout = screenIdFromLayout;
/**
 * Screen id for a layout path — the value the generated marker carries.
 *
 * Mirrors the canonical rule in `JsonUIShared::ScreenIndex.screen_id_for_path`
 * (jsonui-cli `shared/core/screen_index.rb`): basename, drop `.json`, then cut
 * at the LAST `@` so a size variant resolves to the screen it varies
 * (`home@compact.json` and `home.json` are one screen, and the generator
 * emits one marker for both).
 *
 * A second implementation rather than a shared import, for the same reason the
 * mock checker duplicates its glob semantics: this driver installs as an npm
 * package with no access to the Ruby tooling. The duplication is three lines;
 * what keeps it from becoming a second *decision* is that both sides are
 * stated against the same canon and tested on the same vectors.
 */
function screenIdFromLayout(layout) {
    if (!layout)
        return null;
    const base = layout.split(/[\\/]/).pop() ?? '';
    const stem = base.endsWith('.json') ? base.slice(0, -'.json'.length) : base;
    const at = stem.lastIndexOf('@');
    const id = at === -1 ? stem : stem.slice(0, at);
    return id.length > 0 ? id : null;
}
//# sourceMappingURL=screenIdentity.js.map