/**
 * JsonUI Test Runner - Web Driver
 * Serializes run results to the standardized results JSON (schemas/results.schema.json)
 */
import { TestSuiteResult } from '../models/types';
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
export declare class ResultsWriter {
    /**
     * Write suite results to a results JSON file (default './jsonui-results.json')
     */
    static write(suites: TestSuiteResult[], outputPath?: string, platform?: string): void;
    /**
     * Convert in-memory suite results to the standardized results JSON shape.
     * status is derived: skipped -> 'skipped', else passed/failed.
     */
    static toResultsJson(suites: TestSuiteResult[], platform?: string): ResultsJson;
}
//# sourceMappingURL=ResultsWriter.d.ts.map