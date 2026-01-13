"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * Assertion executor using Playwright
 *
 * Uses id attribute for element matching (ReactJsonUI exposes id as HTML id attribute)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssertionExecutor = void 0;
class AssertionExecutor {
    constructor(page, defaultTimeout = 5000) {
        this.page = page;
        this.defaultTimeout = defaultTimeout;
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
            default:
                throw new Error(`Unknown assertion: ${assertion}`);
        }
    }
    async assertVisible(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("visible requires 'id'");
        }
        const element = await this.waitForElement(id, timeout);
        const isVisible = await element.isVisible();
        if (!isVisible) {
            throw new Error(`Element '${id}' should be visible but it is not`);
        }
    }
    async assertNotVisible(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("notVisible requires 'id'");
        }
        // Wait briefly and check element is not visible
        await this.page.waitForTimeout(Math.min(timeout, 1000));
        const element = this.getLocator(id);
        const count = await element.count();
        if (count > 0) {
            const isVisible = await element.first().isVisible();
            if (isVisible) {
                throw new Error(`Element '${id}' should not be visible but it is`);
            }
        }
        // Success - element was not found or not visible
    }
    async assertEnabled(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("enabled requires 'id'");
        }
        const element = await this.waitForElement(id, timeout);
        // Check for disabled attribute or aria-disabled
        const isDisabled = await element.evaluate((el) => {
            if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
                return el.disabled;
            }
            return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled');
        });
        if (isDisabled) {
            throw new Error(`Element '${id}' should be enabled but it is disabled`);
        }
    }
    async assertDisabled(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("disabled requires 'id'");
        }
        const element = await this.waitForElement(id, timeout);
        // Check for disabled attribute or aria-disabled
        const isDisabled = await element.evaluate((el) => {
            if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
                return el.disabled;
            }
            return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled');
        });
        if (!isDisabled) {
            throw new Error(`Element '${id}' should be disabled but it is enabled`);
        }
    }
    async assertText(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("text requires 'id'");
        }
        const element = await this.waitForElement(id, timeout);
        // For input/textarea, get value; otherwise get text content
        const actualText = await element.evaluate((el) => {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                return el.value;
            }
            // Check for nested input/textarea
            const input = el.querySelector('input, textarea');
            if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
                return input.value;
            }
            return el.textContent ?? '';
        });
        if (step.equals !== undefined) {
            const expectedText = String(step.equals);
            if (actualText !== expectedText) {
                throw new Error(`Expected text '${expectedText}' but got '${actualText}' for element '${id}'`);
            }
        }
        else if (step.contains !== undefined) {
            if (!actualText.includes(step.contains)) {
                throw new Error(`Expected text containing '${step.contains}' but got '${actualText}' for element '${id}'`);
            }
        }
        else {
            throw new Error("text requires 'equals' or 'contains'");
        }
    }
    async assertCount(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("count requires 'id'");
        }
        if (step.equals === undefined || typeof step.equals !== 'number') {
            throw new Error("count requires 'equals' with integer value");
        }
        const expected = step.equals;
        // Wait for at least one element (or timeout)
        try {
            await this.waitForElement(id, timeout);
        }
        catch {
            // If no elements found and expected is 0, that's valid
            if (expected === 0) {
                return;
            }
            throw new Error(`Expected ${expected} elements with id '${id}', but found 0`);
        }
        // Count all elements with the given data-testid
        const elements = this.getLocator(id);
        const actualCount = await elements.count();
        if (actualCount !== expected) {
            throw new Error(`Expected ${expected} elements with id '${id}', but found ${actualCount}`);
        }
    }
    // Helper functions
    /**
     * Get locator for element by id attribute
     */
    getLocator(id) {
        return this.page.locator(`#${id}`);
    }
    /**
     * Wait for element to appear by id attribute
     */
    async waitForElement(id, timeout) {
        const element = this.getLocator(id);
        try {
            await element.first().waitFor({ state: 'visible', timeout });
            return element.first();
        }
        catch (error) {
            throw new Error(`Element '${id}' not found by id within ${timeout}ms`);
        }
    }
}
exports.AssertionExecutor = AssertionExecutor;
//# sourceMappingURL=AssertionExecutor.js.map