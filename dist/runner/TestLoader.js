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
exports.TestLoader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class TestLoader {
    /**
     * Load a test from a file path
     */
    static loadFromFile(filePath) {
        const absolutePath = path.resolve(filePath);
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
        if (!test.sources || test.sources.length === 0) {
            throw new Error(`Flow test '${filePath}' is missing 'sources' field`);
        }
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
}
exports.TestLoader = TestLoader;
//# sourceMappingURL=TestLoader.js.map