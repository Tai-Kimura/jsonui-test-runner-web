/** Jest configuration for the web driver unit tests (pure logic + fake-Page runner tests) */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts']
};
