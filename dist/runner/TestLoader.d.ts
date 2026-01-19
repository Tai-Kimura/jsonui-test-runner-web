/**
 * JsonUI Test Runner - Web Driver
 * Test loader for loading test definitions from JSON files
 */
import { ScreenTest, FlowTestStep, TestCase, LoadedTest } from '../models/types';
/**
 * Custom error for test loading failures
 */
export declare class CaseNotFoundError extends Error {
    constructor(caseName: string, file: string);
}
export declare class NotAScreenTestError extends Error {
    constructor(file: string);
}
export declare class TestLoader {
    /** Base path for resolving relative file references */
    private static basePath;
    /**
     * Set base path for resolving relative file references
     */
    static setBasePath(filePath: string): void;
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
    /**
     * Resolve a file reference to a ScreenTest
     */
    static resolveFileReference(fileRef: string): ScreenTest;
    /**
     * Resolve a file reference step to test cases with args substitution
     */
    static resolveFileReferenceCases(step: FlowTestStep): TestCase[];
    /**
     * Apply args substitution to a test case.
     * Merges screen default args with flow override args, then substitutes @{varName} placeholders.
     */
    static applyArgsSubstitution(testCase: TestCase, flowArgs?: Record<string, unknown>): TestCase;
    /**
     * Substitute @{varName} placeholders in a TestStep
     */
    private static substituteArgsInStep;
    /**
     * Substitute @{varName} placeholders in a string
     */
    private static substituteArgsInString;
    /**
     * Substitute @{varName} placeholders in any value (recursively for objects/arrays, only strings substituted)
     */
    private static substituteArgsInValue;
    /**
     * Convert any value to string for substitution
     */
    private static valueToString;
    /**
     * Resolve a file reference path to an absolute path
     */
    private static resolveFileReferenceURL;
}
//# sourceMappingURL=TestLoader.d.ts.map