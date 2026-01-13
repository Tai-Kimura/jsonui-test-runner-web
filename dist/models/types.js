"use strict";
/**
 * JsonUI Test Runner - Web Driver Models
 * Type definitions for test cases and results
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformIncludes = platformIncludes;
exports.getPassedCount = getPassedCount;
exports.getFailedCount = getFailedCount;
exports.allPassed = allPassed;
exports.isAction = isAction;
exports.isAssertion = isAssertion;
function platformIncludes(target, platform) {
    if (!target)
        return true;
    if (typeof target === 'string') {
        return target === platform || target === 'all';
    }
    return target.includes(platform);
}
function getPassedCount(result) {
    return result.results.filter(r => r.passed).length;
}
function getFailedCount(result) {
    return result.results.filter(r => !r.passed).length;
}
function allPassed(result) {
    return result.results.every(r => r.passed);
}
// MARK: - Helper Functions
function isAction(step) {
    return step.action !== undefined;
}
function isAssertion(step) {
    return step.assert !== undefined;
}
//# sourceMappingURL=types.js.map