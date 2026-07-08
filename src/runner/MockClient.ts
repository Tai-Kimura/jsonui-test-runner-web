/**
 * JsonUI Test Runner - Mock server admin client
 *
 * Talks to the local mock server's admin API (/__jsonui__/) to switch API mock
 * scenarios during a test run. Used by the runner for a screen test's root
 * `mocks` (set before the screen re-fetches) and for `setMocks` steps in flows.
 */

import { APIRequestContext } from 'playwright';

export type MockScenarioMap = Record<string, string>;

export class MockClient {
  constructor(
    private request: APIRequestContext,
    private baseUrl: string,
    private token: string
  ) {}

  /** Switch a set of endpoints to the given scenarios. Throws on unknown refs. */
  async scenarioSet(mocks: MockScenarioMap): Promise<void> {
    const res = await this.request.post(`${this.baseUrl}/__jsonui__/scenario-set`, {
      headers: this.headers(),
      data: { mocks }
    });
    if (!res.ok()) {
      throw new Error(`mock scenario-set failed: HTTP ${res.status()}`);
    }
    const body = await res.json();
    if (Array.isArray(body.unknown) && body.unknown.length > 0) {
      throw new Error(`mock scenario-set: unknown operationId(s): ${body.unknown.join(', ')}`);
    }
  }

  /** Reset every endpoint back to its default scenario. */
  async reset(): Promise<void> {
    const res = await this.request.post(`${this.baseUrl}/__jsonui__/reset`, {
      headers: this.headers()
    });
    if (!res.ok()) {
      throw new Error(`mock reset failed: HTTP ${res.status()}`);
    }
  }

  private headers(): Record<string, string> {
    return { 'X-JsonUI-Token': this.token, 'Content-Type': 'application/json' };
  }
}
