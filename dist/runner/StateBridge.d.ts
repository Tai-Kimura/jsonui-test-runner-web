/**
 * JsonUI Test Runner - Web Driver
 * The state bridge (app -> driver, spec §10.4): `window.__JSONUI_STATE__[screenId]`
 * holds `{ launchId, initialState: { applied, rejected } | null, data }` for each
 * screen showing, published by the generated hook (rjui's useJsonUITestBridge)
 * while NODE_ENV !== 'production'.
 *
 * Two readers: the receipt check after a launch that carried a payload
 * (waitForReceipt), and the default `state` provider (lookupState, whose path
 * rule and outcomes are specs/vectors/state-path.json).
 */
import { Page } from 'playwright';
export interface InitialStateReceipt {
    applied: string[];
    rejected: {
        key: string;
        reason: string;
    }[];
}
/** What the bridge holds for one screen (only `truncated` on an iOS overflow). */
export interface BridgeSnapshot {
    launchId?: string | null;
    initialState?: InitialStateReceipt | null;
    data?: Record<string, unknown>;
    truncated?: number;
}
/**
 * Read one screen's bridge. Null when the page has no bridge for it (the screen
 * is not showing, the build has the gate closed, or the page does not go
 * through the generated hook).
 */
export declare function readBridge(page: Page, screenId: string): Promise<BridgeSnapshot | null>;
export type PathResolution = {
    resolved: true;
    value: unknown;
} | {
    resolved: false;
};
/**
 * Resolve a dot path in bridge data. On an object a segment is a key (digits
 * included); on an array a decimal segment without a leading zero is an index;
 * an empty segment, or a step into a string / number / boolean / null, does
 * not resolve. A key holding null resolves to null.
 */
export declare function resolveStatePath(data: unknown, path: string): PathResolution;
export type StateLookup = {
    outcome: 'value';
    value: unknown;
} | {
    outcome: 'unresolved';
}
/** No bridge, or one without data: keep waiting; `reason` explains it on timeout. */
 | {
    outcome: 'pending';
    reason: string;
}
/** iOS over 32 KB: fails at once. */
 | {
    outcome: 'truncated';
    bytes: number;
};
export declare function lookupInBridge(bridge: BridgeSnapshot | null, path: string, screenId?: string): StateLookup;
/**
 * Wait for the screen's bridge to show the receipt of `launchId`, up to
 * `timeout` ms. Throws when none comes (no receipt), or when the receipt
 * rejects any key (each key and reason listed).
 */
export declare function waitForReceipt(page: Page, screenId: string, launchId: string, timeout: number, pollMs?: number): Promise<InitialStateReceipt>;
//# sourceMappingURL=StateBridge.d.ts.map