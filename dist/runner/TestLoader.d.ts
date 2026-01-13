/**
 * JsonUI Test Runner - Web Driver
 * Test loader for loading test definitions from JSON files
 */
import { LoadedTest } from '../models/types';
export declare class TestLoader {
    /**
     * Load a test from a file path
     */
    static loadFromFile(filePath: string): LoadedTest;
    /**
     * Load a test from JSON string
     */
    static loadFromString(json: string, filePath?: string): LoadedTest;
    /**
     * Load all tests from a directory
     */
    static loadFromDirectory(dirPath: string): LoadedTest[];
    /**
     * Find all .test.json files in a directory recursively
     */
    private static findTestFiles;
    /**
     * Parse test JSON and return appropriate test type
     */
    private static parseTest;
    /**
     * Validate and return a ScreenTest
     */
    private static validateScreenTest;
    /**
     * Validate and return a FlowTest
     */
    private static validateFlowTest;
}
//# sourceMappingURL=TestLoader.d.ts.map