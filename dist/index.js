"use strict";
/**
 * JsonUI Test Runner - Web Driver
 *
 * A Playwright-based test runner for ReactJsonUI applications.
 * Executes JSON-defined UI tests against web applications.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestRunnerBuilder = exports.JsonUITestRunner = exports.TestLoader = exports.AssertionExecutor = exports.ActionExecutor = void 0;
exports.createRunner = createRunner;
// Models
__exportStar(require("./models/types"), exports);
// Actions
var ActionExecutor_1 = require("./actions/ActionExecutor");
Object.defineProperty(exports, "ActionExecutor", { enumerable: true, get: function () { return ActionExecutor_1.ActionExecutor; } });
// Assertions
var AssertionExecutor_1 = require("./assertions/AssertionExecutor");
Object.defineProperty(exports, "AssertionExecutor", { enumerable: true, get: function () { return AssertionExecutor_1.AssertionExecutor; } });
// Runner
var TestLoader_1 = require("./runner/TestLoader");
Object.defineProperty(exports, "TestLoader", { enumerable: true, get: function () { return TestLoader_1.TestLoader; } });
var JsonUITestRunner_1 = require("./runner/JsonUITestRunner");
Object.defineProperty(exports, "JsonUITestRunner", { enumerable: true, get: function () { return JsonUITestRunner_1.JsonUITestRunner; } });
Object.defineProperty(exports, "TestRunnerBuilder", { enumerable: true, get: function () { return JsonUITestRunner_1.TestRunnerBuilder; } });
// Convenience function for creating test runners
const JsonUITestRunner_2 = require("./runner/JsonUITestRunner");
function createRunner() {
    return new JsonUITestRunner_2.TestRunnerBuilder();
}
//# sourceMappingURL=index.js.map