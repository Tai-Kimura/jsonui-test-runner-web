/**
 * JsonUI Test Runner - Web Driver
 * Action executor using Playwright
 *
 * Uses data-testid for element matching (ReactJsonUI exposes testId as data-testid)
 */

import { Page, Locator } from 'playwright';
import { TestStep } from '../models/types';

export class ActionExecutor {
  private page: Page;
  private defaultTimeout: number;

  constructor(page: Page, defaultTimeout: number = 5000) {
    this.page = page;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Execute an action step
   */
  async execute(step: TestStep): Promise<void> {
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
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async executeTap(step: TestStep, timeout: number): Promise<void> {
    const id = step.id;
    if (!id) {
      throw new Error("tap requires 'id'");
    }
    const element = await this.waitForElement(id, timeout);
    await element.click();
  }

  private async executeDoubleTap(step: TestStep, timeout: number): Promise<void> {
    const id = step.id;
    if (!id) {
      throw new Error("doubleTap requires 'id'");
    }
    const element = await this.waitForElement(id, timeout);
    await element.dblclick();
  }

  private async executeLongPress(step: TestStep, timeout: number): Promise<void> {
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

  private async executeInput(step: TestStep, timeout: number): Promise<void> {
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
    } else {
      // Try filling directly if the element itself is an input
      await element.fill(value);
    }
  }

  private async executeClear(step: TestStep, timeout: number): Promise<void> {
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
    } else {
      // Try clearing directly if the element itself is an input
      await element.clear();
    }
  }

  private async executeScroll(step: TestStep, timeout: number): Promise<void> {
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

  private async executeSwipe(step: TestStep, timeout: number): Promise<void> {
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

  private async executeWaitFor(step: TestStep, timeout: number): Promise<void> {
    const id = step.id;
    if (!id) {
      throw new Error("waitFor requires 'id'");
    }
    await this.waitForElement(id, timeout);
  }

  private async executeWaitForAny(step: TestStep, timeout: number): Promise<void> {
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

  private async executeWait(step: TestStep): Promise<void> {
    const ms = step.ms;
    if (ms === undefined) {
      throw new Error("wait requires 'ms'");
    }
    await this.page.waitForTimeout(ms);
  }

  private async executeBack(): Promise<void> {
    await this.page.goBack();
  }

  private async executeScreenshot(step: TestStep): Promise<void> {
    const name = step.name ?? `screenshot_${Date.now()}`;
    await this.page.screenshot({ path: `${name}.png` });
  }

  // Helper functions

  /**
   * Get locator for element by data-testid
   */
  private getLocator(id: string): Locator {
    return this.page.locator(`[data-testid="${id}"]`);
  }

  /**
   * Wait for element to appear by data-testid
   */
  private async waitForElement(id: string, timeout: number): Promise<Locator> {
    const element = this.getLocator(id);

    try {
      await element.first().waitFor({ state: 'visible', timeout });
      return element.first();
    } catch (error) {
      throw new Error(`Element '${id}' not found by data-testid within ${timeout}ms`);
    }
  }
}
