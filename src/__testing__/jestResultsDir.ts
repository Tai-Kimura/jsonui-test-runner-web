/**
 * Jest setupFiles: every runner a test builds writes its run's results to the
 * default location (DefaultResults.ts). Point that at a scratch folder so no
 * test ever writes under the real HOME. Tests that check the location inject
 * their own env / home instead of reading this.
 */
import * as os from 'os';
import * as path from 'path';

export const JEST_RESULTS_DIR = path.join(os.tmpdir(), 'jsonui-test-runner-web-jest-results');

process.env.JSONUI_TEST_RESULTS_DIR = JEST_RESULTS_DIR;
