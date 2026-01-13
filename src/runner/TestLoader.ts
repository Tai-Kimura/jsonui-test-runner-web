/**
 * JsonUI Test Runner - Web Driver
 * Test loader for loading test definitions from JSON files
 */

import * as fs from 'fs';
import * as path from 'path';
import { ScreenTest, FlowTest, LoadedTest } from '../models/types';

export class TestLoader {
  /**
   * Load a test from a file path
   */
  static loadFromFile(filePath: string): LoadedTest {
    const absolutePath = path.resolve(filePath);
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
