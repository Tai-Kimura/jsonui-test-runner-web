"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * Serializes run results to the standardized results JSON (schemas/results.schema.json)
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
exports.ResultsWriter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ResultsWriter {
    /**
     * Write suite results to a results JSON file (default './jsonui-results.json')
     */
    static write(suites, outputPath = './jsonui-results.json', platform = 'web') {
        const payload = this.toResultsJson(suites, platform);
        const absolutePath = path.resolve(outputPath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2), 'utf-8');
    }
    /**
     * Convert in-memory suite results to the standardized results JSON shape.
     * status is derived: skipped -> 'skipped', else passed/failed.
     */
    static toResultsJson(suites, platform = 'web') {
        return {
            format: 'jsonui-test-results',
            version: 1,
            platform,
            generatedAt: new Date().toISOString(),
            suites: suites.map(suite => ({
                suiteName: suite.suiteName,
                totalDurationMs: suite.totalDurationMs,
                results: suite.results.map(result => {
                    const entry = {
                        testName: result.testName,
                        caseName: result.caseName,
                        status: result.skipped ? 'skipped' : result.passed ? 'passed' : 'failed',
                        durationMs: result.durationMs
                    };
                    if (result.error !== undefined) {
                        entry.error = result.error;
                    }
                    // skipReason is only meaningful on skipped rows (schema: optional enum)
                    if (result.skipped && result.skipReason !== undefined) {
                        entry.skipReason = result.skipReason;
                    }
                    if (result.warnings !== undefined && result.warnings.length > 0) {
                        entry.warnings = result.warnings;
                    }
                    if (!result.skipped && result.attempts !== undefined) {
                        entry.attempts = result.attempts;
                        // flaky is only meaningful on a pass that needed retries
                        // (results.schema.json; the validator rejects flaky on failures)
                        if (result.passed && result.attempts > 1) {
                            entry.flaky = true;
                        }
                    }
                    return entry;
                })
            }))
        };
    }
}
exports.ResultsWriter = ResultsWriter;
//# sourceMappingURL=ResultsWriter.js.map