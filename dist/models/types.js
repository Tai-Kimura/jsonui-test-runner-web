"use strict";
/**
 * JsonUI Test Runner - Web Driver Models
 * Type definitions for test cases and results
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_CONDITION_KEYS = void 0;
exports.unknownConditionKeys = unknownConditionKeys;
exports.resolveViewportSize = resolveViewportSize;
exports.deriveOrientation = deriveOrientation;
exports.resolveSizeTier = resolveSizeTier;
exports.matchesResponsive = matchesResponsive;
exports.platformIncludes = platformIncludes;
exports.getPassedCount = getPassedCount;
exports.getFailedCount = getFailedCount;
exports.allPassed = allPassed;
exports.isAction = isAction;
exports.isAssertion = isAssertion;
exports.isFileReference = isFileReference;
exports.deepEquals = deepEquals;
exports.isBlockStep = isBlockStep;
exports.isInlineStep = isInlineStep;
/**
 * Condition keys this driver understands. A condition containing any other key
 * (e.g. one added by a newer schema) is treated as UNMET so the step fail-safe
 * skips instead of running at a state it cannot verify (never run-anyway,
 * never throw).
 */
exports.KNOWN_CONDITION_KEYS = new Set([
    'visible',
    'notVisible',
    'platform',
    'responsive',
    'state'
]);
/** Keys of a condition object this driver does not understand (fail-safe skip when non-empty) */
function unknownConditionKeys(condition) {
    return Object.keys(condition).filter(key => !exports.KNOWN_CONDITION_KEYS.has(key));
}
/**
 * Resolve the current viewport size. `page.viewportSize()` returns null for
 * `viewport: null` contexts (headful / --start-maximized), so fall back to
 * `window.innerWidth/innerHeight` — which is also what the renderer's CSS
 * breakpoints actually see (closer to the SSoT than the viewport setting).
 */
async function resolveViewportSize(page) {
    const viewport = page.viewportSize();
    if (viewport) {
        return { width: viewport.width, height: viewport.height };
    }
    return page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
}
/** Orientation derived from the current size (square counts as landscape) */
function deriveOrientation(size) {
    return size.height > size.width ? 'portrait' : 'landscape';
}
/** Exclusive width tier: >= regular -> 'regular', >= medium -> 'medium', else 'compact' */
function resolveSizeTier(width, thresholds) {
    if (width >= thresholds.regular) {
        return 'regular';
    }
    if (width >= thresholds.medium) {
        return 'medium';
    }
    return 'compact';
}
/**
 * Evaluate a `responsive` condition against the current size.
 * - Named tier buckets match the resolved tier at any orientation.
 * - 'landscape' matches orientation landscape at any tier.
 * - '<tier>-landscape' matches tier AND landscape.
 * - Constraint objects AND all present keys (min/max inclusive per the schema).
 * - An unrecognized named bucket (newer schema than this driver) is UNMET, so
 *   the gated step/case fail-safe skips.
 */
function matchesResponsive(condition, size, thresholds) {
    const orientation = deriveOrientation(size);
    if (typeof condition === 'string') {
        const tier = resolveSizeTier(size.width, thresholds);
        switch (condition) {
            case 'compact':
            case 'medium':
            case 'regular':
                return tier === condition;
            case 'landscape':
                return orientation === 'landscape';
            case 'compact-landscape':
            case 'medium-landscape':
            case 'regular-landscape':
                return orientation === 'landscape' && tier === condition.slice(0, -'-landscape'.length);
            default:
                // Fail-safe: a bucket this driver does not know is unmet -> skip
                return false;
        }
    }
    if (condition.minWidth !== undefined && size.width < condition.minWidth)
        return false;
    if (condition.maxWidth !== undefined && size.width > condition.maxWidth)
        return false;
    if (condition.minHeight !== undefined && size.height < condition.minHeight)
        return false;
    if (condition.maxHeight !== undefined && size.height > condition.maxHeight)
        return false;
    if (condition.orientation !== undefined && condition.orientation !== orientation)
        return false;
    return true;
}
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
function isFileReference(step) {
    return step.file !== undefined;
}
/**
 * Deep equality for state values (primitives compared strictly, objects/arrays structurally)
 */
function deepEquals(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null || a === undefined || b === undefined)
        return false;
    if (typeof a !== typeof b)
        return false;
    if (typeof a !== 'object')
        return false;
    return JSON.stringify(a) === JSON.stringify(b);
}
function isBlockStep(step) {
    return step.block !== undefined;
}
function isInlineStep(step) {
    return step.screen !== undefined && (step.action !== undefined || step.assert !== undefined);
}
//# sourceMappingURL=types.js.map