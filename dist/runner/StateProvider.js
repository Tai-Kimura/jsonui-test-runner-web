"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * State provider for `state` assertions and `state` conditions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRUNCATED_MESSAGE = exports.BridgeStateProvider = void 0;
exports.lookupState = lookupState;
const StateBridge_1 = require("./StateBridge");
/**
 * The default provider: resolves `path` in the `data` of
 * `window.__JSONUI_STATE__[screenId]`, for the screen the runner says `state`
 * reads (spec §6: the screen under test; in a flow the step's `screen`, else
 * the last one named; a referenced case reads its own file's screen).
 */
class BridgeStateProvider {
    constructor(page, screen) {
        this.page = page;
        this.screen = screen;
    }
    async lookup(path) {
        const screenId = this.screen();
        if (!screenId) {
            return {
                outcome: 'pending',
                reason: 'no screen to read state from (a flow step names none yet, and the test has no source.layout)'
            };
        }
        return (0, StateBridge_1.lookupInBridge)(await (0, StateBridge_1.readBridge)(this.page, screenId), path, screenId);
    }
    async getValue(path) {
        const found = await this.lookup(path);
        return found.outcome === 'value' ? found.value : undefined;
    }
}
exports.BridgeStateProvider = BridgeStateProvider;
/** A provider's answer as a lookup (harness providers have only getValue). */
async function lookupState(provider, path) {
    if (provider.lookup)
        return provider.lookup(path);
    const value = await provider.getValue(path);
    return value === undefined ? { outcome: 'unresolved' } : { outcome: 'value', value };
}
const TRUNCATED_MESSAGE = (path, bytes) => `state '${path}': the state bridge is truncated (${bytes} bytes; the iOS bridge holds up to 32 KB)`;
exports.TRUNCATED_MESSAGE = TRUNCATED_MESSAGE;
//# sourceMappingURL=StateProvider.js.map