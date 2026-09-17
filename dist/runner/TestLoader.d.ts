/**
 * JsonUI Test Runner - Web Driver
 * Test loader for loading test definitions from JSON files
 */
import { ScreenTest, FlowTestStep, TestCase, TestStep, LoadedTest } from '../models/types';
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
     * Directory of the currently loaded test file, for resolving step-level
     * relative paths (addMedia fixtures etc.). Null before any load.
     */
    static getBasePath(): string | null;
    /**
     * Load a test from a file path.
     *
     * This is the TOP-LEVEL entry: the file it loads owns the base that
     * relative references and step-level paths resolve against. A screen test
     * run on its own resolves against its own directory; a flow resolves
     * against the flow's. Reading a file BECAUSE a flow referenced it is not
     * a load in this sense — see `readTestFile`.
     */
    static loadFromFile(filePath: string): LoadedTest;
    /**
     * Read and parse a test file WITHOUT touching the base.
     *
     * `resolveFileReference` used to go through `loadFromFile`, which set
     * `basePath` unconditionally — so the first `file:` step of a flow moved
     * the base from `tests/flows/` to `tests/screens/<first>/`, and the second
     * step (a different screen) looked under `tests/screens/screens/<second>/`
     * and was "not found". Referencing the same screen twice passed by
     * accident (`<base>/<ref>.test.json` existed), which is why the defect
     * only surfaced when a flow crossed two screens. Calling `setBasePath`
     * right before the flow did not help: the first reference overwrote it.
     */
    private static readTestFile;
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
     * Substitute remaining @{varName} placeholders with runtime variables (readText results).
     * Applied at step-execution time, AFTER load-time args substitution. Unknown names
     * stay as literal text (consistent with args behavior). Does not recurse into
     * nested control-step 'steps' - those are resolved when they execute (so a
     * readText inside a repeat block updates the value for later iterations).
     */
    static substituteRuntimeVariables(step: TestStep, variables: Record<string, unknown>): TestStep;
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