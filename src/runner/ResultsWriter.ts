/**
 * JsonUI Test Runner - Web Driver
 * Serializes run results to the standardized results JSON (schemas/results.schema.json)
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestSuiteResult } from '../models/types';

// MARK: - Results JSON shape (results.schema.json)

export interface ResultsJson {
  format: 'jsonui-test-results';
  version: 1;
  platform: string;
  generatedAt: string;
  suites: ResultsJsonSuite[];
}

export interface ResultsJsonSuite {
  suiteName: string;
  totalDurationMs: number;
  results: ResultsJsonResult[];
}

export interface ResultsJsonResult {
  testName: string;
  caseName: string;
  status: 'passed' | 'failed' | 'skipped';
  error?: string;
  warnings?: string[];
  durationMs: number;
}

export class ResultsWriter {
  /**
   * Write suite results to a results JSON file (default './jsonui-results.json')
   */
  static write(
    suites: TestSuiteResult[],
    outputPath: string = './jsonui-results.json',
    platform: string = 'web'
  ): void {
    const payload = this.toResultsJson(suites, platform);
    const absolutePath = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  /**
   * Convert in-memory suite results to the standardized results JSON shape.
   * status is derived: skipped -> 'skipped', else passed/failed.
   */
  static toResultsJson(suites: TestSuiteResult[], platform: string = 'web'): ResultsJson {
    return {
      format: 'jsonui-test-results',
      version: 1,
      platform,
      generatedAt: new Date().toISOString(),
      suites: suites.map(suite => ({
        suiteName: suite.suiteName,
        totalDurationMs: suite.totalDurationMs,
        results: suite.results.map(result => {
          const entry: ResultsJsonResult = {
            testName: result.testName,
            caseName: result.caseName,
            status: result.skipped ? 'skipped' : result.passed ? 'passed' : 'failed',
            durationMs: result.durationMs
          };
          if (result.error !== undefined) {
            entry.error = result.error;
          }
          if (result.warnings !== undefined && result.warnings.length > 0) {
            entry.warnings = result.warnings;
          }
          return entry;
        })
      }))
    };
  }
}
