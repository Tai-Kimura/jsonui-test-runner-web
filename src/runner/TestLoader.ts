/**
 * JsonUI Test Runner - Web Driver
 * Test loader for loading test definitions from JSON files
 */

import * as fs from 'fs';
import * as path from 'path';
import { ScreenTest, FlowTest, FlowTestStep, TestCase, LoadedTest } from '../models/types';

/**
 * Custom error for test loading failures
 */
export class CaseNotFoundError extends Error {
  constructor(caseName: string, file: string) {
    super(`Test case '${caseName}' not found in file: ${file}`);
    this.name = 'CaseNotFoundError';
  }
}

export class NotAScreenTestError extends Error {
  constructor(file: string) {
    super(`File reference must point to a screen test: ${file}`);
    this.name = 'NotAScreenTestError';
  }
}

export class TestLoader {
  /** Base path for resolving relative file references */
  private static basePath: string | null = null;

  /**
   * Set base path for resolving relative file references
   */
  static setBasePath(filePath: string): void {
    this.basePath = path.dirname(filePath);
  }

  /**
   * Load a test from a file path
   */
  static loadFromFile(filePath: string): LoadedTest {
    const absolutePath = path.resolve(filePath);
    // Store base path for file reference resolution
    this.basePath = path.dirname(absolutePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    return this.parseTest(content, absolutePath);
  }

  /**
   * Load a test from JSON string
   */
  static loadFromString(json: string, filePath: string = ''): LoadedTest {
    return this.parseTest(json, filePath);
  }

  /**
   * Load all tests from a directory
   */
  static loadFromDirectory(dirPath: string): LoadedTest[] {
    const absolutePath = path.resolve(dirPath);
    const files = this.findTestFiles(absolutePath);
    return files.map(file => this.loadFromFile(file));
  }

  /**
   * Find all .test.json files in a directory recursively
   */
  private static findTestFiles(dirPath: string): string[] {
    const results: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        results.push(...this.findTestFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.test.json')) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /**
   * Parse test JSON and return appropriate test type
   */
  private static parseTest(json: string, filePath: string): LoadedTest {
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
  private static validateScreenTest(data: unknown, filePath: string): ScreenTest {
    const test = data as ScreenTest;

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
  private static validateFlowTest(data: unknown, filePath: string): FlowTest {
    const test = data as FlowTest;

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
  static resolveFileReference(fileRef: string): ScreenTest {
    const resolvedPath = this.resolveFileReferenceURL(fileRef);
    const loadedTest = this.loadFromFile(resolvedPath);

    if (loadedTest.type !== 'screen') {
      throw new NotAScreenTestError(fileRef);
    }

    return loadedTest.test;
  }

  /**
   * Resolve a file reference step to test cases
   */
  static resolveFileReferenceCases(step: FlowTestStep): TestCase[] {
    if (!step.file) {
      return [];
    }

    const screenTest = this.resolveFileReference(step.file);

    // If specific case is requested
    if (step.case) {
      const testCase = screenTest.cases.find(c => c.name === step.case);
      if (!testCase) {
        throw new CaseNotFoundError(step.case, step.file);
      }
      return [testCase];
    }

    // If specific cases are requested
    if (step.cases && step.cases.length > 0) {
      return step.cases.map(caseName => {
        const testCase = screenTest.cases.find(c => c.name === caseName);
        if (!testCase) {
          throw new CaseNotFoundError(caseName, step.file!);
        }
        return testCase;
      });
    }

    // Return all cases if no specific case requested
    return screenTest.cases;
  }

  /**
   * Resolve a file reference path to an absolute path
   */
  private static resolveFileReferenceURL(fileRef: string): string {
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
