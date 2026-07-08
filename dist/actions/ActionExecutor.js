"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * Action executor using Playwright
 *
 * Uses id attribute for element matching (ReactJsonUI exposes id as HTML id attribute)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionExecutor = void 0;
class ActionExecutor {
    constructor(page, defaultTimeout = 5000, variables = {}) {
        this.page = page;
        this.defaultTimeout = defaultTimeout;
        this.variables = variables;
    }
    /**
     * Execute an action step
     */
    async execute(step) {
        const action = step.action;
        if (!action) {
            throw new Error('Step has no action');
        }
        const timeout = step.timeout ?? this.defaultTimeout;
        switch (action) {
            case 'tap':
                await this.executeTap(step, timeout);
                break;
            case 'doubleTap':
                await this.executeDoubleTap(step, timeout);
                break;
            case 'longPress':
                await this.executeLongPress(step, timeout);
                break;
            case 'input':
                await this.executeInput(step, timeout);
                break;
            case 'clear':
                await this.executeClear(step, timeout);
                break;
            case 'scroll':
                await this.executeScroll(step, timeout);
                break;
            case 'scrollUntilVisible':
                await this.executeScrollUntilVisible(step);
                break;
            case 'swipe':
                await this.executeSwipe(step, timeout);
                break;
            case 'waitFor':
                await this.executeWaitFor(step, timeout);
                break;
            case 'waitForAny':
                await this.executeWaitForAny(step, timeout);
                break;
            case 'wait':
                await this.executeWait(step);
                break;
            case 'back':
                await this.executeBack();
                break;
            case 'screenshot':
                await this.executeScreenshot(step);
                break;
            case 'alertTap':
                await this.executeAlertTap(step, timeout);
                break;
            case 'selectOption':
                await this.executeSelectOption(step, timeout);
                break;
            case 'tapItem':
                await this.executeTapItem(step, timeout);
                break;
            case 'selectTab':
                await this.executeSelectTab(step, timeout);
                break;
            case 'readText':
                await this.executeReadText(step, timeout);
                break;
            case 'setLocation':
                await this.executeSetLocation(step);
                break;
            case 'addMedia':
                await this.executeAddMedia();
                break;
            case 'repeat':
            case 'retry':
                // Control steps are executed by the runner (they need condition evaluation
                // and nested step handling); reaching here means the runner was bypassed
                throw new Error(`'${action}' is a control step and is handled by the test runner`);
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
    async executeTap(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("tap requires 'id'");
        }
        const element = await this.waitForElement(id, timeout);
        // If text is specified, tap on the specific text portion within the element
        if (step.text) {
            await this.tapTextPortion(element, step.text);
        }
        else {
            await element.click();
        }
    }
    async executeDoubleTap(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("doubleTap requires 'id'");
        }
        const element = await this.waitForElement(id, timeout);
        await element.dblclick();
    }
    async executeLongPress(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("longPress requires 'id'");
        }
        const duration = step.duration ?? 500;
        const element = await this.waitForElement(id, timeout);
        // Playwright doesn't have built-in long press, simulate with mouse down/up
        await element.hover();
        await this.page.mouse.down();
        await this.page.waitForTimeout(duration);
        await this.page.mouse.up();
    }
    async executeInput(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("input requires 'id'");
        }
        const value = step.value;
        if (value === undefined) {
            throw new Error("input requires 'value'");
        }
        const element = await this.waitForElement(id, timeout);
        // Try to find an input element within the container
        const input = element.locator('input, textarea').first();
        const hasInput = await input.count() > 0;
        if (hasInput) {
            await input.fill(value);
        }
        else {
            // Try filling directly if the element itself is an input
            await element.fill(value);
        }
    }
    async executeClear(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("clear requires 'id'");
        }
        const element = await this.waitForElement(id, timeout);
        // Try to find an input element within the container
        const input = element.locator('input, textarea').first();
        const hasInput = await input.count() > 0;
        if (hasInput) {
            await input.clear();
        }
        else {
            // Try clearing directly if the element itself is an input
            await element.clear();
        }
    }
    async executeScroll(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("scroll requires 'id'");
        }
        const direction = step.direction;
        if (!direction) {
            throw new Error("scroll requires 'direction'");
        }
        const element = await this.waitForElement(id, timeout);
        const box = await element.boundingBox();
        if (!box) {
            throw new Error(`Element '${id}' has no bounding box`);
        }
        const scrollAmount = step.amount ?? 300;
        // Scroll within the element
        await element.evaluate((el, { direction, amount }) => {
            switch (direction) {
                case 'up':
                    el.scrollTop -= amount;
                    break;
                case 'down':
                    el.scrollTop += amount;
                    break;
                case 'left':
                    el.scrollLeft -= amount;
                    break;
                case 'right':
                    el.scrollLeft += amount;
                    break;
            }
        }, { direction, amount: scrollAmount });
    }
    async executeSwipe(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("swipe requires 'id'");
        }
        const direction = step.direction;
        if (!direction) {
            throw new Error("swipe requires 'direction'");
        }
        const element = await this.waitForElement(id, timeout);
        const box = await element.boundingBox();
        if (!box) {
            throw new Error(`Element '${id}' has no bounding box`);
        }
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const swipeDistance = Math.min(box.width, box.height) / 2;
        let startX = centerX;
        let startY = centerY;
        let endX = centerX;
        let endY = centerY;
        switch (direction) {
            case 'up':
                startY = centerY + swipeDistance;
                endY = centerY - swipeDistance;
                break;
            case 'down':
                startY = centerY - swipeDistance;
                endY = centerY + swipeDistance;
                break;
            case 'left':
                startX = centerX + swipeDistance;
                endX = centerX - swipeDistance;
                break;
            case 'right':
                startX = centerX - swipeDistance;
                endX = centerX + swipeDistance;
                break;
        }
        // Perform swipe gesture
        await this.page.mouse.move(startX, startY);
        await this.page.mouse.down();
        await this.page.mouse.move(endX, endY, { steps: 10 });
        await this.page.mouse.up();
    }
    async executeWaitFor(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("waitFor requires 'id'");
        }
        await this.waitForElement(id, timeout);
    }
    async executeWaitForAny(step, timeout) {
        const ids = step.ids;
        if (!ids || ids.length === 0) {
            throw new Error("waitForAny requires non-empty 'ids'");
        }
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            for (const id of ids) {
                const element = this.getLocator(id);
                const count = await element.count();
                if (count > 0 && await element.first().isVisible()) {
                    return;
                }
            }
            await this.page.waitForTimeout(100);
        }
        throw new Error(`None of elements [${ids.join(', ')}] appeared within ${timeout}ms`);
    }
    async executeWait(step) {
        const ms = step.ms;
        if (ms === undefined) {
            throw new Error("wait requires 'ms'");
        }
        await this.page.waitForTimeout(ms);
    }
    async executeBack() {
        await this.page.goBack();
    }
    async executeScreenshot(step) {
        const name = step.name ?? `screenshot_${Date.now()}`;
        await this.page.screenshot({ path: `${name}.png` });
    }
    async executeAlertTap(step, timeout) {
        const buttonText = step.button;
        if (!buttonText) {
            throw new Error("alertTap requires 'button'");
        }
        // Set up dialog handler before triggering
        // For web, native alerts (alert, confirm, prompt) are handled via page.on('dialog')
        // This implementation assumes the alert is already showing or will appear
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.page.removeListener('dialog', dialogHandler);
                reject(new Error(`Alert did not appear within ${timeout}ms`));
            }, timeout);
            const dialogHandler = async (dialog) => {
                clearTimeout(timeoutId);
                const dialogType = dialog.type();
                // For confirm dialogs, match button text to accept/dismiss
                if (dialogType === 'confirm') {
                    // Common button text mappings
                    const acceptTexts = ['OK', 'Yes', 'Confirm', 'Accept', 'はい', '確認', 'OK'];
                    const dismissTexts = ['Cancel', 'No', 'Dismiss', 'いいえ', 'キャンセル'];
                    if (acceptTexts.some(t => t.toLowerCase() === buttonText.toLowerCase())) {
                        await dialog.accept();
                        resolve();
                        return;
                    }
                    if (dismissTexts.some(t => t.toLowerCase() === buttonText.toLowerCase())) {
                        await dialog.dismiss();
                        resolve();
                        return;
                    }
                    // If button text doesn't match known patterns, try accept
                    await dialog.accept();
                    resolve();
                    return;
                }
                // For alert dialogs, just dismiss (they only have OK)
                if (dialogType === 'alert') {
                    await dialog.accept();
                    resolve();
                    return;
                }
                // For prompt dialogs
                if (dialogType === 'prompt') {
                    const acceptTexts = ['OK', 'Submit', 'Yes', 'はい', '確認'];
                    if (acceptTexts.some(t => t.toLowerCase() === buttonText.toLowerCase())) {
                        await dialog.accept();
                    }
                    else {
                        await dialog.dismiss();
                    }
                    resolve();
                    return;
                }
                // Default: accept
                await dialog.accept();
                resolve();
            };
            this.page.once('dialog', dialogHandler);
        });
    }
    async executeSelectOption(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("selectOption requires 'id'");
        }
        const element = await this.waitForElement(id, timeout);
        // Try to find a select element within the container
        const select = element.locator('select').first();
        const hasSelect = await select.count() > 0;
        const targetSelect = hasSelect ? select : element;
        // Select by value, label, or index
        if (step.value !== undefined) {
            await targetSelect.selectOption({ value: step.value });
        }
        else if (step.label !== undefined) {
            await targetSelect.selectOption({ label: step.label });
        }
        else if (step.index !== undefined) {
            await targetSelect.selectOption({ index: step.index });
        }
        else {
            throw new Error("selectOption requires 'value', 'label', or 'index'");
        }
    }
    async executeTapItem(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("tapItem requires 'id'");
        }
        const index = step.index;
        if (index === undefined) {
            throw new Error("tapItem requires 'index'");
        }
        // Find the item using the generated id pattern: {collectionId}_item_{index}
        const itemId = `${id}_item_${index}`;
        const element = await this.waitForElement(itemId, timeout);
        await element.click();
    }
    async executeSelectTab(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("selectTab requires 'id'");
        }
        const index = step.index;
        if (index === undefined) {
            throw new Error("selectTab requires 'index'");
        }
        // Find the tab using the generated id pattern: {tabViewId}_tab_{index}
        const tabId = `${id}_tab_${index}`;
        const element = await this.waitForElement(tabId, timeout);
        await element.click();
    }
    async executeScrollUntilVisible(step) {
        const id = step.id;
        if (!id) {
            throw new Error("scrollUntilVisible requires 'id'");
        }
        const direction = step.direction ?? 'down';
        const timeout = step.timeout ?? 20000;
        const target = this.getLocator(id).first();
        const isTargetVisible = async () => {
            return (await target.count()) > 0 && await target.isVisible();
        };
        if (await isTargetVisible()) {
            return;
        }
        const startTime = Date.now();
        let previousMarker = null;
        let unchangedCount = 0;
        while (Date.now() - startTime < timeout) {
            const marker = await this.scrollOneStep(step.container, direction);
            if (await isTargetVisible()) {
                return;
            }
            // End-reached detection: two consecutive scrolls with no position/content change
            if (marker !== null && marker === previousMarker) {
                unchangedCount += 1;
                if (unchangedCount >= 1) {
                    throw new Error(`Element '${id}' not found after scrolling to the end of ${step.container ? `'${step.container}'` : 'the page'}`);
                }
            }
            else {
                unchangedCount = 0;
            }
            previousMarker = marker;
            await this.page.waitForTimeout(150);
        }
        throw new Error(`Element '${id}' did not become visible within ${timeout}ms of scrolling`);
    }
    /**
     * Scroll one step in the given direction. Returns a marker string describing the
     * scroll position after scrolling (used for end-reached detection), or null if unknown.
     */
    async scrollOneStep(containerId, direction) {
        if (containerId) {
            const container = this.getLocator(containerId).first();
            if (await container.count() === 0) {
                throw new Error(`scrollUntilVisible container '${containerId}' not found`);
            }
            return container.evaluate((el, dir) => {
                const step = Math.round((dir === 'up' || dir === 'down' ? el.clientHeight : el.clientWidth) * 0.7);
                switch (dir) {
                    case 'up':
                        el.scrollTop -= step;
                        break;
                    case 'down':
                        el.scrollTop += step;
                        break;
                    case 'left':
                        el.scrollLeft -= step;
                        break;
                    case 'right':
                        el.scrollLeft += step;
                        break;
                }
                return `${el.scrollTop},${el.scrollLeft}`;
            }, direction);
        }
        // Scroll the window
        return this.page.evaluate((dir) => {
            const step = Math.round((dir === 'up' || dir === 'down' ? window.innerHeight : window.innerWidth) * 0.7);
            switch (dir) {
                case 'up':
                    window.scrollBy(0, -step);
                    break;
                case 'down':
                    window.scrollBy(0, step);
                    break;
                case 'left':
                    window.scrollBy(-step, 0);
                    break;
                case 'right':
                    window.scrollBy(step, 0);
                    break;
            }
            return `${window.scrollY},${window.scrollX}`;
        }, direction);
    }
    async executeReadText(step, timeout) {
        const id = step.id;
        if (!id) {
            throw new Error("readText requires 'id'");
        }
        const variable = step.variable;
        if (!variable) {
            throw new Error("readText requires 'variable'");
        }
        const element = await this.waitForElement(id, timeout);
        // For input/textarea, read value; otherwise text content
        const text = await element.evaluate((el) => {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                return el.value;
            }
            const input = el.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea');
            if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
                return input.value;
            }
            return el.textContent ?? '';
        });
        this.variables[variable] = text;
    }
    async executeSetLocation(step) {
        const { latitude, longitude } = step;
        if (latitude === undefined || longitude === undefined) {
            throw new Error("setLocation requires 'latitude' and 'longitude'");
        }
        const context = this.page.context();
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation({ latitude, longitude });
    }
    async executeAddMedia() {
        throw new Error('addMedia is not supported on web');
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
    /**
     * Tap on a specific text portion within an element
     * Calculates the approximate position of the target text and clicks there
     */
    async tapTextPortion(element, targetText) {
        const fullText = await element.textContent();
        if (!fullText) {
            throw new Error('Element has no text content');
        }
        const startIndex = fullText.indexOf(targetText);
        if (startIndex === -1) {
            throw new Error(`Text '${targetText}' not found in element text '${fullText}'`);
        }
        const endIndex = startIndex + targetText.length;
        const totalLength = fullText.length;
        if (totalLength === 0) {
            await element.click();
            return;
        }
        // Calculate the center position of the target text (as a ratio of the element width)
        const startRatio = startIndex / totalLength;
        const endRatio = endIndex / totalLength;
        const centerRatio = (startRatio + endRatio) / 2;
        // Get the bounding box of the element
        const box = await element.boundingBox();
        if (!box) {
            throw new Error('Element has no bounding box');
        }
        // Calculate the tap coordinate
        const tapX = box.x + (box.width * centerRatio);
        const tapY = box.y + (box.height / 2);
        // Click at the calculated position
        await this.page.mouse.click(tapX, tapY);
    }
}
exports.ActionExecutor = ActionExecutor;
//# sourceMappingURL=ActionExecutor.js.map