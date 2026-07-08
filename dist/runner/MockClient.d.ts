/**
 * JsonUI Test Runner - Mock server admin client
 *
 * Talks to the local mock server's admin API (/__jsonui__/) to switch API mock
 * scenarios during a test run. Used by the runner for a screen test's root
 * `mocks` (set before the screen re-fetches) and for `setMocks` steps in flows.
 */
import { APIRequestContext } from 'playwright';
export type MockScenarioMap = Record<string, string>;
export declare class MockClient {
    private request;
    private baseUrl;
    private token;
    constructor(request: APIRequestContext, baseUrl: string, token: string);
    /** Switch a set of endpoints to the given scenarios. Throws on unknown refs. */
    scenarioSet(mocks: MockScenarioMap): Promise<void>;
    /** Reset every endpoint back to its default scenario. */
    reset(): Promise<void>;
    private headers;
}
//# sourceMappingURL=MockClient.d.ts.map