/**
 * JsonUI Test Runner - Web Driver
 * State provider for `state` assertions and `state` conditions
 */
import { Page } from 'playwright';
import { StateLookup } from './StateBridge';
/**
 * Provides ViewModel state values by dot-notation path.
 *
 * The default is BridgeStateProvider, which needs nothing from the harness. A
 * provider passed in the runner config (`stateProvider`) wins over it.
 */
export interface StateProvider {
    /**
     * Get the value at the given dot-notation path (e.g. 'user.isLoggedIn').
     * Returns undefined when the path does not resolve.
     */
    getValue(path: string): Promise<unknown>;
    /**
     * Optional richer answer: pending / truncated / value / unresolved. When
     * present the runner uses it instead of getValue (a truncated bridge fails
     * at once, a pending one says why on timeout).
     */
    lookup?(path: string): Promise<StateLookup>;
}
/**
 * The default provider: resolves `path` in the `data` of
 * `window.__JSONUI_STATE__[screenId]`, for the screen the runner says `state`
 * reads (spec §6: the screen under test; in a flow the step's `screen`, else
 * the last one named; a referenced case reads its own file's screen).
 */
export declare class BridgeStateProvider implements StateProvider {
    private page;
    private screen;
    constructor(page: Page, screen: () => string | undefined);
    lookup(path: string): Promise<StateLookup>;
    getValue(path: string): Promise<unknown>;
}
/** A provider's answer as a lookup (harness providers have only getValue). */
export declare function lookupState(provider: StateProvider, path: string): Promise<StateLookup>;
export declare const TRUNCATED_MESSAGE: (path: string, bytes: number) => string;
//# sourceMappingURL=StateProvider.d.ts.map