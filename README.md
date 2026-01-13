# JsonUI Test Runner - Web Driver

Playwright-based test runner for ReactJsonUI applications. Executes JSON-defined UI tests against web applications.

## Installation

```bash
npm install @jsonui/test-runner-web playwright
```

## Usage

### Basic Usage with Playwright

```typescript
import { test } from '@playwright/test';
import { JsonUITestRunner, TestLoader } from '@jsonui/test-runner-web';

test('login screen test', async ({ page }) => {
  // Navigate to your app
  await page.goto('http://localhost:3000');

  // Load test definition
  const testDef = TestLoader.loadFromFile('./tests/login.test.json');

  // Create runner
  const runner = new JsonUITestRunner(page, {
    defaultTimeout: 10000,
    screenshotOnFailure: true,
    verbose: true
  });

  // Run test
  const result = await runner.run(testDef);

  // Check results
  expect(result.results.every(r => r.passed)).toBe(true);
});
```

### Using the Builder Pattern

```typescript
import { createRunner, TestLoader } from '@jsonui/test-runner-web';

test('home screen test', async ({ page }) => {
  await page.goto('http://localhost:3000');

  const testDef = TestLoader.loadFromFile('./tests/home.test.json');

  const runner = createRunner()
    .defaultTimeout(10000)
    .screenshotOnFailure(true)
    .screenshotDir('./test-screenshots')
    .verbose(true)
    .build(page);

  const result = await runner.run(testDef);

  // Log failed cases
  result.results
    .filter(r => !r.passed)
    .forEach(r => console.log(`Failed: ${r.caseName} - ${r.error}`));

  expect(result.results.every(r => r.passed)).toBe(true);
});
```

### Loading Tests

```typescript
import { TestLoader } from '@jsonui/test-runner-web';

// Load from file
const test = TestLoader.loadFromFile('./tests/login.test.json');

// Load from JSON string
const test = TestLoader.loadFromString(jsonString);

// Load all tests from directory
const tests = TestLoader.loadFromDirectory('./tests');
```

## Test JSON Format

### Screen Test

```json
{
  "type": "screen",
  "source": {
    "layout": "Layouts/Login.json"
  },
  "metadata": {
    "name": "Login Screen Test",
    "description": "Tests for the login screen"
  },
  "cases": [
    {
      "name": "initial_display",
      "steps": [
        { "assert": "visible", "id": "email_input" },
        { "assert": "visible", "id": "password_input" },
        { "assert": "disabled", "id": "login_button" }
      ]
    },
    {
      "name": "email_input",
      "steps": [
        { "action": "input", "id": "email_input", "value": "test@example.com" },
        { "assert": "text", "id": "email_input", "equals": "test@example.com" }
      ]
    }
  ]
}
```

### Flow Test

```json
{
  "type": "flow",
  "sources": [
    { "layout": "Layouts/Login.json", "alias": "login" },
    { "layout": "Layouts/Home.json", "alias": "home" }
  ],
  "metadata": {
    "name": "Login Flow Test"
  },
  "steps": [
    { "screen": "login", "action": "input", "id": "email_input", "value": "user@example.com" },
    { "screen": "login", "action": "input", "id": "password_input", "value": "password123" },
    { "screen": "login", "action": "tap", "id": "login_button" },
    { "screen": "home", "assert": "visible", "id": "welcome_message" }
  ]
}
```

## Element Identification

Elements are identified using `data-testid` attribute in React/ReactJsonUI:

```tsx
// React component
<button data-testid="login_button">Login</button>

// ReactJsonUI (automatically generated from testId property)
{
  "type": "Button",
  "testId": "login_button",
  "text": "Login"
}
```

## Available Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `tap` | Click element | `id` |
| `doubleTap` | Double-click element | `id` |
| `longPress` | Long press element | `id`, `duration?` |
| `input` | Enter text | `id`, `value` |
| `clear` | Clear input | `id` |
| `scroll` | Scroll within element | `id`, `direction`, `amount?` |
| `swipe` | Swipe gesture | `id`, `direction` |
| `waitFor` | Wait for element | `id`, `timeout?` |
| `waitForAny` | Wait for any element | `ids`, `timeout?` |
| `wait` | Wait for duration | `ms` |
| `back` | Navigate back | - |
| `screenshot` | Take screenshot | `name?` |

## Available Assertions

| Assertion | Description | Parameters |
|-----------|-------------|------------|
| `visible` | Element is visible | `id` |
| `notVisible` | Element is not visible | `id` |
| `enabled` | Element is enabled | `id` |
| `disabled` | Element is disabled | `id` |
| `text` | Text verification | `id`, `equals?`, `contains?` |
| `count` | Element count | `id`, `equals` |

## Configuration

```typescript
interface TestRunnerConfig {
  defaultTimeout?: number;      // Default: 5000ms
  screenshotOnFailure?: boolean; // Default: true
  screenshotDir?: string;       // Default: './screenshots'
  platform?: string;            // Default: 'web'
  verbose?: boolean;            // Default: false
}
```

## Platform Targeting

Tests can be platform-specific:

```json
{
  "type": "screen",
  "platform": "web",  // Only run on web
  "cases": [
    {
      "name": "web_only_test",
      "platform": ["web", "ios"],  // Run on web and iOS
      "steps": [...]
    }
  ]
}
```

## License

MIT License
