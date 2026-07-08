"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * State provider for `state` assertions and `state` conditions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowStateProvider = void 0;
/**
 * Default state provider reading window.__JSONUI_STATE__ via page.evaluate.
 * The JsonUI app is expected to expose its ViewModel state on that global.
 */
class WindowStateProvider {
    constructor(page) {
        this.page = page;
    }
    async getValue(statePath) {
        return this.page.evaluate((p) => {
            const root = window.__JSONUI_STATE__;
            let current = root;
            for (const segment of p.split('.')) {
                if (current === null || current === undefined || typeof current !== 'object') {
                    return undefined;
                }
                current = current[segment];
            }
            return current;
        }, statePath);
    }
}
exports.WindowStateProvider = WindowStateProvider;
//# sourceMappingURL=StateProvider.js.map