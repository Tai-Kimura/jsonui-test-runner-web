/** Jest globalTeardown: remove the scratch results folder jestResultsDir.ts pointed the runners at. */
import * as fs from 'fs';
import { JEST_RESULTS_DIR } from './jestResultsDir';

export default function teardown(): void {
  fs.rmSync(JEST_RESULTS_DIR, { recursive: true, force: true });
}
