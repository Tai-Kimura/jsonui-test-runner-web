"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * Assertion executor using Playwright
 *
 * Uses id attribute for element matching (ReactJsonUI exposes id as HTML id attribute)
 *
 * All element assertions auto-wait: they poll the condition every 100ms until it
 * holds or the timeout (step.timeout ?? defaultTimeout) elapses.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssertionExecutor = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pngjs_1 = require("pngjs");
const pixelmatch_1 = __importDefault(require("pixelmatch"));
const types_1 = require("../models/types");
/** Polling interval for auto-wait assertions */
const POLL_INTERVAL_MS = 100;
/** RGBA channel difference (0-255) below which two pixels are considered a match */
const CHANNEL_TOLERANCE = 16;
class AssertionExecutor {
    constructor(page, defaultTimeout = 5000, options = {}) {
        /** Warnings produced by the current step (e.g. baseline created); drained by the runner */
        this.warnings = [];
        this.page = page;
        this.defaultTimeout = defaultTimeout;
        this.screenTransitionTimeout = options.screenTransitionTimeout ?? 10000;
        this.stateProvider = options.stateProvider;
        this.baselineDir = options.baselineDir ?? './baselines';
        this.updateBaselines = options.updateBaselines ?? false;
    }
    /**
     * Execute an assertion step
     */
    async execute(step) {
        const assertion = step.assert;
        if (!assertion) {
            throw new Error('Step has no assert');
        }
        const timeout = step.timeout ?? this.defaultTimeout;
        switch (assertion) {
            case 'visible':
                await this.assertVisible(step, timeout);
                break;
            case 'notVisible':
                await this.assertNotVisible(step, timeout);
                break;
            case 'enabled':
                await this.assertEnabled(step, timeout);
                break;
            case 'disabled':
                await this.assertDisabled(step, timeout);
                break;
            case 'text':
                await this.assertText(step, timeout);
                break;
            case 'count':
                await this.assertCount(step, timeout);
                break;
            case 'state':
                await this.assertState(step, timeout);
                break;
            case 'screenshot':
                await this.assertScreenshot(step);
                break;
            case 'openedUrl':
                await this.assertOpenedUrl(step, timeout);
                break;
            case 'screen':
                await this.assertScreen(step, step.timeout ?? this.screenTransitionTimeout);
                break;
            default:
                throw new Error(`Unknown assertion: ${assertion}`);
        }
    }
    /**
     * Poll `check` every POLL_INTERVAL_MS until it returns null (pass) or the timeout
     * elapses. `check` returns an error message string while the condition is unmet.
     * The last error message is thrown on timeout.
     */
    async pollUntil(timeout, check) {
        const startTime = Date.now();
        let lastError = 'assertion timed out';
        // Always evaluate at least once even if timeout is 0
        for (;;) {
            const error = await check();
            if (error === null) {
                return;
            }
            lastError = error;
            if (Date.now() - startTime >= timeout) {
                break;
            }
            await this.page.waitForTimeout(POLL_INTERVAL_MS);
        }
        throw new Error(lastError);
    }
    /**
     * `assert: "screen"` — the named screen IS DISPLAYED.
     *
     * Not "displayed exclusively": embedded screens, split panes and tab hosts
     * legitimately show several markers at once, so this only ever looks at the
     * target's own marker.
     *
     * Measured with React 19 SSR + a suspending transition: a client-side swap
     * never exposes two screens' markers at once, and a pending transition
     * never mounts the destination's marker early — while it is pending, NO
     * marker is present. So the predicate needs no exclusivity test and no
     * transition handling, and a zero-marker reading is only meaningful once
     * the timeout has expired.
     *
     * Known limitation (measured, deliberately not part of the predicate):
     * server-rendered markup carries the marker before hydration, so on the
     * FIRST document load this can pass while clicks are still being dropped.
     * React exposes no standard "hydrated" signal, so gating on one is not
     * implementable; it does not recur on client-side navigation.
     */
    async assertScreen(step, timeout) {
        const screenId = step.name;
        if (!screenId) {
            throw new Error("screen requires 'name'");
        }
        const locator = this.page.locator(`[data-screen="${screenId}"]`);
        await this.pollUntil(timeout, async () => {
            if ((await locator.count()) === 0)
                return await this.screenDiagnosis(screenId);
            if (await locator.first().isVisible())
                return null;
            return `marker-not-displayed: screen '${screenId}' is present but not visible`;
        });
    }
    /**
     * Canonical failure classes: a missing marker anywhere is stale generated
     * code or a stale build (infrastructure), while the previous screen still
     * being the only one present means the navigation did not happen.
     */
    async screenDiagnosis(screenId) {
        const present = await this.page
            .locator('[data-screen]')
            .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-screen')).filter((v) => !!v))
            .catch(() => []);
        if (present.length === 0) {
            return ('marker-absent: no screen marker anywhere. The app is either built for production ' +
                '(markers are development-only) or its generated code is stale — rebuild with `jui build`.');
        }
        return `previous-screen-only: '${screenId}' is not displayed; displayed screens are ${JSON.stringify(present)}`;
    }
    async assertVisible(step, timeout) {
        const id = this.requireId(step, 'visible');
        await this.pollUntil(timeout, async () => {
            const element = this.getLocator(id).first();
            if (await element.count() === 0) {
                return `Element '${id}' should be visible but it does not exist`;
            }
            return await element.isVisible()
                ? null
                : `Element '${id}' should be visible but it is not`;
        });
    }
    async assertNotVisible(step, timeout) {
        const id = this.requireId(step, 'notVisible');
        await this.pollUntil(timeout, async () => {
            const element = this.getLocator(id);
            if (await element.count() === 0) {
                return null;
            }
            return await element.first().isVisible()
                ? `Element '${id}' should not be visible but it is`
                : null;
        });
    }
    async assertEnabled(step, timeout) {
        const id = this.requireId(step, 'enabled');
        await this.pollUntil(timeout, async () => {
            const element = this.getLocator(id).first();
            if (await element.count() === 0) {
                return `Element '${id}' not found by id`;
            }
            const disabled = await this.isElementDisabled(element);
            return disabled ? `Element '${id}' should be enabled but it is disabled` : null;
        });
    }
    async assertDisabled(step, timeout) {
        const id = this.requireId(step, 'disabled');
        await this.pollUntil(timeout, async () => {
            const element = this.getLocator(id).first();
            if (await element.count() === 0) {
                return `Element '${id}' not found by id`;
            }
            const disabled = await this.isElementDisabled(element);
            return disabled ? null : `Element '${id}' should be disabled but it is enabled`;
        });
    }
    async assertText(step, timeout) {
        const id = this.requireId(step, 'text');
        if (step.equals === undefined && step.contains === undefined) {
            throw new Error("text requires 'equals' or 'contains'");
        }
        await this.pollUntil(timeout, async () => {
            const element = this.getLocator(id).first();
            if (await element.count() === 0) {
                return `Element '${id}' not found by id`;
            }
            const actualText = await this.readElementText(element);
            if (step.equals !== undefined) {
                const expected = String(step.equals);
                return actualText === expected
                    ? null
                    : `Expected text '${expected}' but got '${actualText}' for element '${id}'`;
            }
            return actualText.includes(step.contains)
                ? null
                : `Expected text containing '${step.contains}' but got '${actualText}' for element '${id}'`;
        });
    }
    async assertCount(step, timeout) {
        const id = this.requireId(step, 'count');
        if (step.equals === undefined || typeof step.equals !== 'number') {
            throw new Error("count requires 'equals' with integer value");
        }
        const expected = step.equals;
        await this.pollUntil(timeout, async () => {
            const actualCount = await this.getLocator(id).count();
            return actualCount === expected
                ? null
                : `Expected ${expected} elements with id '${id}', but found ${actualCount}`;
        });
    }
    async assertState(step, timeout) {
        const statePath = step.path;
        if (!statePath) {
            throw new Error("state requires 'path'");
        }
        if (step.equals === undefined) {
            throw new Error("state requires 'equals'");
        }
        if (!this.stateProvider) {
            throw new Error(`Cannot assert state '${statePath}': no state provider configured`);
        }
        const provider = this.stateProvider;
        await this.pollUntil(timeout, async () => {
            const actual = await provider.getValue(statePath);
            return (0, types_1.deepEquals)(actual, step.equals)
                ? null
                : `State '${statePath}' should be ${JSON.stringify(step.equals)} but got ${JSON.stringify(actual)}`;
        });
    }
    /**
     * Assert against the most recent window.open call recorded by the runner's
     * spy (installed on every document). Auto-waits like element assertions so
     * an open triggered by an async handler still lands within the timeout.
     * Web-only — gate with when.platform in cross-platform tests.
     */
    async assertOpenedUrl(step, timeout) {
        if (step.equals === undefined && step.contains === undefined) {
            throw new Error("openedUrl assertion requires 'equals' or 'contains'");
        }
        await this.pollUntil(timeout, async () => {
            const urls = await this.page.evaluate(() => window.__jsonuiOpenedUrls ?? []);
            const last = urls[urls.length - 1];
            if (last === undefined) {
                return 'no window.open call recorded';
            }
            if (step.equals !== undefined && last !== String(step.equals)) {
                return `last opened url '${last}' does not equal '${step.equals}'`;
            }
            if (step.contains !== undefined && !last.includes(step.contains)) {
                return `last opened url '${last}' does not contain '${step.contains}'`;
            }
            return null;
        });
    }
    async assertScreenshot(step) {
        const name = step.name;
        if (!name) {
            throw new Error("screenshot requires 'name'");
        }
        const threshold = step.threshold ?? 98.0;
        // Capture (optionally cropped to an element's bounding box)
        let capture;
        if (step.cropId) {
            const element = this.getLocator(step.cropId).first();
            if (await element.count() === 0) {
                throw new Error(`screenshot cropId '${step.cropId}' not found`);
            }
            capture = await element.screenshot();
        }
        else {
            capture = await this.page.screenshot();
        }
        const baselinePath = path.join(this.baselineDir, 'web', `${name}.png`);
        if (this.updateBaselines || !fs.existsSync(baselinePath)) {
            fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
            fs.writeFileSync(baselinePath, capture);
            this.warnings.push(this.updateBaselines
                ? `baseline updated: ${baselinePath}`
                : `baseline created: ${baselinePath}`);
            return;
        }
        const baseline = pngjs_1.PNG.sync.read(fs.readFileSync(baselinePath));
        const current = pngjs_1.PNG.sync.read(capture);
        if (baseline.width !== current.width || baseline.height !== current.height) {
            throw new Error(`Screenshot '${name}' size mismatch: baseline ${baseline.width}x${baseline.height}, ` +
                `current ${current.width}x${current.height}`);
        }
        const total = baseline.width * baseline.height;
        const diffPixels = (0, pixelmatch_1.default)(baseline.data, current.data, null, baseline.width, baseline.height, { threshold: CHANNEL_TOLERANCE / 255 });
        const similarity = total === 0 ? 100 : (100 * (total - diffPixels)) / total;
        if (similarity < threshold) {
            throw new Error(`Screenshot '${name}' similarity ${similarity.toFixed(2)}% is below threshold ${threshold}%`);
        }
    }
    // Helper functions
    requireId(step, assertion) {
        const id = step.id;
        if (!id) {
            throw new Error(`${assertion} requires 'id'`);
        }
        return id;
    }
    /**
     * Get locator for element by id attribute
     */
    getLocator(id) {
        return this.page.locator(`#${id}`);
    }
    async isElementDisabled(element) {
        return element.evaluate((el) => {
            if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
                return el.disabled;
            }
            return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled');
        });
    }
    async readElementText(element) {
        return element.evaluate((el) => {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                return el.value;
            }
            // Check for nested input/textarea. Checkbox/radio inputs are excluded:
            // their `value` is a form-submission token (default "on"), not
            // user-visible text — for composite controls (label + input) the
            // visible text is the label's textContent.
            const input = el.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea');
            if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
                return input.value;
            }
            return el.textContent ?? '';
        });
    }
}
exports.AssertionExecutor = AssertionExecutor;
//# sourceMappingURL=AssertionExecutor.js.map