/** Jest configuration for the web driver unit tests (pure logic + fake-Page runner tests) */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  // Keep the runner's default results write out of the real HOME.
  setupFiles: ['<rootDir>/src/__testing__/jestResultsDir.ts'],
  globalTeardown: '<rootDir>/src/__testing__/jestGlobalTeardown.ts'
};
