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
exports.lookupInBridge = exports.resolveStatePath = exports.waitForReceipt = exports.readBridge = exports.planLaunches = exports.INITIAL_STATE_KEY = exports.ARGS_KEY = exports.clearTestStorage = exports.applyLaunchToPage = exports.SUPPORTED_SCHEMA_VERSION = exports.RUN_DEFAULTS_FILENAME = exports.defaultOrientationForTier = exports.loadRunDefaults = exports.ResultsWriter = exports.MockClient = exports.BridgeStateProvider = exports.TestRunnerBuilder = exports.JsonUITestRunner = exports.TestLoader = exports.AssertionExecutor = exports.ActionExecutor = void 0;
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
var StateProvider_1 = require("./runner/StateProvider");
Object.defineProperty(exports, "BridgeStateProvider", { enumerable: true, get: function () { return StateProvider_1.BridgeStateProvider; } });
var MockClient_1 = require("./runner/MockClient");
Object.defineProperty(exports, "MockClient", { enumerable: true, get: function () { return MockClient_1.MockClient; } });
var ResultsWriter_1 = require("./runner/ResultsWriter");
Object.defineProperty(exports, "ResultsWriter", { enumerable: true, get: function () { return ResultsWriter_1.ResultsWriter; } });
var RunDefaults_1 = require("./runner/RunDefaults");
Object.defineProperty(exports, "loadRunDefaults", { enumerable: true, get: function () { return RunDefaults_1.loadRunDefaults; } });
Object.defineProperty(exports, "defaultOrientationForTier", { enumerable: true, get: function () { return RunDefaults_1.defaultOrientationForTier; } });
Object.defineProperty(exports, "RUN_DEFAULTS_FILENAME", { enumerable: true, get: function () { return RunDefaults_1.RUN_DEFAULTS_FILENAME; } });
Object.defineProperty(exports, "SUPPORTED_SCHEMA_VERSION", { enumerable: true, get: function () { return RunDefaults_1.SUPPORTED_SCHEMA_VERSION; } });
var LaunchConfig_1 = require("./runner/LaunchConfig");
Object.defineProperty(exports, "applyLaunchToPage", { enumerable: true, get: function () { return LaunchConfig_1.applyLaunchToPage; } });
Object.defineProperty(exports, "clearTestStorage", { enumerable: true, get: function () { return LaunchConfig_1.clearTestStorage; } });
Object.defineProperty(exports, "ARGS_KEY", { enumerable: true, get: function () { return LaunchConfig_1.ARGS_KEY; } });
var InitialState_1 = require("./runner/InitialState");
Object.defineProperty(exports, "INITIAL_STATE_KEY", { enumerable: true, get: function () { return InitialState_1.INITIAL_STATE_KEY; } });
Object.defineProperty(exports, "planLaunches", { enumerable: true, get: function () { return InitialState_1.planLaunches; } });
var StateBridge_1 = require("./runner/StateBridge");
Object.defineProperty(exports, "readBridge", { enumerable: true, get: function () { return StateBridge_1.readBridge; } });
Object.defineProperty(exports, "waitForReceipt", { enumerable: true, get: function () { return StateBridge_1.waitForReceipt; } });
Object.defineProperty(exports, "resolveStatePath", { enumerable: true, get: function () { return StateBridge_1.resolveStatePath; } });
Object.defineProperty(exports, "lookupInBridge", { enumerable: true, get: function () { return StateBridge_1.lookupInBridge; } });
// Convenience function for creating test runners
const JsonUITestRunner_2 = require("./runner/JsonUITestRunner");
function createRunner() {
    return new JsonUITestRunner_2.TestRunnerBuilder();
}
//# sourceMappingURL=index.js.map