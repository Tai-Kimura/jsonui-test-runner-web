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

/**
 * And the progress records: a session with jui viz installed carries
 * JSONUI_TEST_PROGRESS_DIR (the plugin sets it to viz's own folder), and the
 * runners here inherited it — one run of this suite on 2026-10-18 put 480
 * fixture runs ("inline", tests "f" / "iso" …) into the real viz's folder,
 * which showed them as web test runs of whoever was at work. Tests that check
 * the progress sink set the variable themselves and restore it.
 */
delete process.env.JSONUI_TEST_PROGRESS_DIR;
