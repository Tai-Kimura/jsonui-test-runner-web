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

Elements are identified using the `id` attribute (HTML id):

```tsx
// React component
<button id="login_button">Login</button>

// ReactJsonUI (id property becomes HTML id attribute)
{
  "type": "Button",
  "id": "login_button",
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
  screenReadyStrategy?: 'auto' | 'marker' | 'networkidle';  // Default: 'auto'
  screenReadyTimeout?: number;  // Default: 15000ms
}
```

### When is a screen "ready"?

A screen test waits for the screen's own `data-screen` marker — the same
beacon the `screen` assertion reads — before running setup. The screen id is
derived from `source.layout` (basename, minus `.json`, cut at the last `@`),
so `docs/screens/layouts/order_detail.json` waits for
`[data-screen="order_detail"]`.

If no screen id can be derived (a hand-written page with no layout), the
runner falls back to `waitForLoadState('networkidle')` **and says so on
stderr**. `screenReadyStrategy` forces one gate either way.

`networkidle` means "500ms with no network activity", which is a condition on
every resource the page references rather than on the screen. One request
that never completes holds it open until the test times out — the screen
renders correctly, the assertions would all pass, and the only output is
`Test timeout of 30000ms exceeded`.

**Checking your own mocks for this:** an external URL is not the risk; a
*hangable* one is. Measured against a real page:

| URL in a mock body | Result |
| --- | --- |
| a host that does not resolve (DNS absent, reserved TLD like `.test`) | fails in ~1.5ms — harmless |
| a real server you do not control | 404 in ~51ms on a good day, **30s timeouts when it is unwell** |

So grepping your mocks to zero external hosts is not the check — a URL that
resolves to somebody else's server is the one that can hang. Prefer `data:`
URIs for decorative images in mock bodies.

### When the screen is *supposed* not to render

Waiting for the screen presumes the screen appears, and some tests pass
precisely because it does not — a permission check that shows a refusal in
its place, an expired session that redirects to login. Their `source.layout`
correctly names the screen they are about, so the marker id is derived
correctly and the wait still cannot succeed.

`screenReadyStrategy` cannot express these: it is one switch for the whole
run, so buying seven such files with it costs every other file the protection
above. The file says it itself:

```jsonc
{
  "type": "screen",
  "source": { "layout": "layouts/admin_reservations.json" },
  "screenReady": "none",          // no gate; the first step does the waiting
  ...
}
```

```jsonc
  // Or name where it lands instead, which keeps a positive readiness
  // condition — this file is still protected from a hung request.
  "screenReady": { "marker": "login" },
```

| `screenReady` | Gate |
| --- | --- |
| absent / `"auto"` | the project-wide strategy (default: marker, falling back to networkidle) |
| `"none"` | none — the test's own first step is responsible for waiting |
| `{ "marker": "<screen id>" }` | that screen's marker, in place of the derived one |
| `"marker"` / `"networkidle"` | forces one gate for this file alone |

A file's declaration outranks `screenReadyStrategy`; every form announces
itself on stderr. Requires driver **1.8.4** and jsonui-cli **1.7.31** (the
canonical schema sets `additionalProperties: false`, so an older `jsonui-test
validate` rejects the key).

### Keeping failure artifacts

Playwright deletes `test-results/` at the **start** of every run, so
re-running a single failing test to "look at it again" destroys the video and
error-context of the failure you were investigating. Copy the directory
before re-running. `playwright-report/` is a separate directory and survives.

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

## API mocks

Run against the JsonUI mock server (`jsonui-test mock serve`) to test empty/error
states deterministically. Point the app at the mock server via
`launch.arguments.apiBase`, and give the runner the server URL + admin token:

```typescript
const runner = createRunner()
  .mockServer('http://127.0.0.1:8790', process.env.JSONUI_MOCK_TOKEN!)
  .build(page);
```

- A screen test's root `mocks` (e.g. `{"listStocks": "empty"}`) is applied and the
  page reloaded before the cases run. Split normal/empty/error into separate test
  files (one scenario set each).
- In flow tests, a `setMocks` step switches scenarios mid-flow; the next navigation
  re-fetches under them.
- Scenarios reset to `default` at the end of each run.

## License

MIT License
