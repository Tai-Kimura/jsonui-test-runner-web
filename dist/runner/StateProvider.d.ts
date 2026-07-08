/**
 * JsonUI Test Runner - Web Driver
 * State provider for `state` assertions and `state` conditions
 */
import { Page } from 'playwright';
/**
 * Provides ViewModel state values by dot-notation path.
 * Custom providers can be injected through the runner config.
 */
export interface StateProvider {
    /**
     * Get the value at the given dot-notation path (e.g. 'user.isLoggedIn').
     * Returns undefined when the path does not resolve.
     */
    getValue(path: string): Promise<unknown>;
}
/**
 * Default state provider reading window.__JSONUI_STATE__ via page.evaluate.
 * The JsonUI app is expected to expose its ViewModel state on that global.
 */
export declare class WindowStateProvider implements StateProvider {
    private page;
    constructor(page: Page);
    getValue(statePath: string): Promise<unknown>;
}
//# sourceMappingURL=StateProvider.d.ts.map