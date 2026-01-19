"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * Test loader for loading test definitions from JSON files
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestLoader = exports.NotAScreenTestError = exports.CaseNotFoundError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Custom error for test loading failures
 */
class CaseNotFoundError extends Error {
    constructor(caseName, file) {
        super(`Test case '${caseName}' not found in file: ${file}`);
        this.name = 'CaseNotFoundError';
    }
}
exports.CaseNotFoundError = CaseNotFoundError;
class NotAScreenTestError extends Error {
    constructor(file) {
        super(`File reference must point to a screen test: ${file}`);
        this.name = 'NotAScreenTestError';
    }
}
exports.NotAScreenTestError = NotAScreenTestError;
class TestLoader {
    /**
     * Set base path for resolving relative file references
     */
    static setBasePath(filePath) {
        this.basePath = path.dirname(filePath);
    }
    /**
     * Load a test from a file path
     */
    static loadFromFile(filePath) {
        const absolutePath = path.resolve(filePath);
        // Store base path for file reference resolution
        this.basePath = path.dirname(absolutePath);
        const content = fs.readFileSync(absolutePath, 'utf-8');
        return this.parseTest(content, absolutePath);
    }
    /**
     * Load a test from JSON string
     */
    static loadFromString(json, filePath = '') {
        return this.parseTest(json, filePath);
    }
    /**
     * Load all tests from a directory
     */
    static loadFromDirectory(dirPath) {
        const absolutePath = path.resolve(dirPath);
        const files = this.findTestFiles(absolutePath);
        return files.map(file => this.loadFromFile(file));
    }
    /**
     * Find all .test.json files in a directory recursively
     */
    static findTestFiles(dirPath) {
        const results = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                results.push(...this.findTestFiles(fullPath));
            }
            else if (entry.isFile() && entry.name.endsWith('.test.json')) {
                results.push(fullPath);
            }
        }
        return results;
    }
    /**
     * Parse test JSON and return appropriate test type
     */
    static parseTest(json, filePath) {
        const data = JSON.parse(json);
        if (!data.type) {
            throw new Error(`Test file '${filePath}' is missing 'type' field`);
        }
        switch (data.type) {
            case 'screen':
                return {
                    type: 'screen',
                    test: this.validateScreenTest(data, filePath),
                    filePath
                };
            case 'flow':
                return {
                    type: 'flow',
                    test: this.validateFlowTest(data, filePath),
                    filePath
                };
            default:
                throw new Error(`Unknown test type '${data.type}' in file '${filePath}'`);
        }
    }
    /**
     * Validate and return a ScreenTest
     */
    static validateScreenTest(data, filePath) {
        const test = data;
        if (!test.source) {
            throw new Error(`Screen test '${filePath}' is missing 'source' field`);
        }
        if (!test.metadata) {
            throw new Error(`Screen test '${filePath}' is missing 'metadata' field`);
        }
        if (!test.metadata.name) {
            throw new Error(`Screen test '${filePath}' is missing 'metadata.name' field`);
        }
        if (!test.cases || test.cases.length === 0) {
            throw new Error(`Screen test '${filePath}' has no test cases`);
        }
        return test;
    }
    /**
     * Validate and return a FlowTest
     */
    static validateFlowTest(data, filePath) {
        const test = data;
        // sources is now optional (not needed when using file references)
        if (!test.metadata) {
            throw new Error(`Flow test '${filePath}' is missing 'metadata' field`);
        }
        if (!test.metadata.name) {
            throw new Error(`Flow test '${filePath}' is missing 'metadata.name' field`);
        }
        if (!test.steps || test.steps.length === 0) {
            throw new Error(`Flow test '${filePath}' has no steps`);
        }
        return test;
    }
    // MARK: - File Reference Resolution
    /**
     * Resolve a file reference to a ScreenTest
     */
    static resolveFileReference(fileRef) {
        const resolvedPath = this.resolveFileReferenceURL(fileRef);
        const loadedTest = this.loadFromFile(resolvedPath);
        if (loadedTest.type !== 'screen') {
            throw new NotAScreenTestError(fileRef);
        }
        return loadedTest.test;
    }
    /**
     * Resolve a file reference step to test cases with args substitution
     */
    static resolveFileReferenceCases(step) {
        if (!step.file) {
            return [];
        }
        const screenTest = this.resolveFileReference(step.file);
        const flowArgs = step.args ?? {};
        // If specific case is requested
        if (step.case) {
            const testCase = screenTest.cases.find(c => c.name === step.case);
            if (!testCase) {
                throw new CaseNotFoundError(step.case, step.file);
            }
            return [this.applyArgsSubstitution(testCase, flowArgs)];
        }
        // If specific cases are requested
        if (step.cases && step.cases.length > 0) {
            return step.cases.map(caseName => {
                const testCase = screenTest.cases.find(c => c.name === caseName);
                if (!testCase) {
                    throw new CaseNotFoundError(caseName, step.file);
                }
                return this.applyArgsSubstitution(testCase, flowArgs);
            });
        }
        // Return all cases if no specific case requested
        return screenTest.cases.map(testCase => this.applyArgsSubstitution(testCase, flowArgs));
    }
    // MARK: - Args Substitution
    /**
     * Apply args substitution to a test case.
     * Merges screen default args with flow override args, then substitutes @{varName} placeholders.
     */
    static applyArgsSubstitution(testCase, flowArgs = {}) {
        // Merge screen default args with flow override args
        const mergedArgs = { ...(testCase.args ?? {}), ...flowArgs };
        // If no args, return original test case
        if (Object.keys(mergedArgs).length === 0) {
            return testCase;
        }
        // Apply substitution to steps
        const substitutedSteps = testCase.steps.map(step => this.substituteArgsInStep(step, mergedArgs));
        return { ...testCase, steps: substitutedSteps };
    }
    /**
     * Substitute @{varName} placeholders in a TestStep
     */
    static substituteArgsInStep(step, args) {
        return {
            ...step,
            id: this.substituteArgsInString(step.id, args),
            ids: step.ids?.map(id => this.substituteArgsInString(id, args) ?? id),
            text: this.substituteArgsInString(step.text, args),
            value: this.substituteArgsInString(step.value, args),
            contains: this.substituteArgsInString(step.contains, args),
            button: this.substituteArgsInString(step.button, args),
            label: this.substituteArgsInString(step.label, args),
            equals: this.substituteArgsInValue(step.equals, args)
        };
    }
    /**
     * Substitute @{varName} placeholders in a string
     */
    static substituteArgsInString(str, args) {
        if (str === undefined)
            return undefined;
        const pattern = /@\{([^}]+)\}/g;
        return str.replace(pattern, (match, varName) => {
            const value = args[varName];
            return value !== undefined ? this.valueToString(value) : match;
        });
    }
    /**
     * Substitute @{varName} placeholders in any value (recursively for objects/arrays, only strings substituted)
     */
    static substituteArgsInValue(value, args) {
        if (value === undefined || value === null)
            return value;
        if (typeof value === 'string') {
            return this.substituteArgsInString(value, args);
        }
        return value;
    }
    /**
     * Convert any value to string for substitution
     */
    static valueToString(value) {
        if (typeof value === 'string')
            return value;
        if (typeof value === 'number' || typeof value === 'boolean')
            return String(value);
        return String(value);
    }
    /**
     * Resolve a file reference path to an absolute path
     */
    static resolveFileReferenceURL(fileRef) {
        if (!this.basePath) {
            throw new Error(`Base path not set for file reference resolution: ${fileRef}`);
        }
        // Parent of basePath (e.g., tests/ when basePath is tests/flows/)
        const parentBase = path.dirname(this.basePath);
        // Try different locations and file extensions
        // Priority: ../screens/ (sibling directory) first, then same directory
        const candidates = [
            path.join(parentBase, 'screens', fileRef, `${fileRef}.test.json`),
            path.join(parentBase, 'screens', fileRef, `${fileRef}.json`),
            path.join(parentBase, 'screens', `${fileRef}.test.json`),
            path.join(parentBase, 'screens', `${fileRef}.json`),
            path.join(this.basePath, `${fileRef}.test.json`),
            path.join(this.basePath, `${fileRef}.json`),
            path.join(this.basePath, fileRef)
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
        throw new Error(`Test file not found: ${fileRef}`);
    }
}
exports.TestLoader = TestLoader;
/** Base path for resolving relative file references */
TestLoader.basePath = null;
//# sourceMappingURL=TestLoader.js.map