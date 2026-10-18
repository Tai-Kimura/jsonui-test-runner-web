# JsonUI Test Runner - Web Driver

Playwright-based test runner for ReactJsonUI applications. Executes JSON-defined UI tests against web applications.

## Installation

```bash
npm install jsonui-test-runner-web playwright
```

## Usage

### Basic Usage with Playwright

```typescript
import { test } from '@playwright/test';
import { JsonUITestRunner, TestLoader } from 'jsonui-test-runner-web';

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
import { createRunner, TestLoader } from 'jsonui-test-runner-web';

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
import { TestLoader } from 'jsonui-test-runner-web';

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
  screenReadyTimeout?: number;  // Default: 15000ms (also the initialState receipt timeout)
  stateProvider?: StateProvider; // Default: the state bridge (leave unset)
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

## Launch, initialState and state

The runner applies everything itself — there is no helper for the harness to
call. When a file has a `launch`, `mocks` or a non-empty `initialState`, the
runner does, in this order, on the page it drives:

1. **clearState** — cookies, and the origin's local and session storage
   (IndexedDB is not touched).
2. **permissions** — when any value is `deny` or `unset`, every permission is
   cleared first, then the `allow`s are granted again (so an earlier file's
   `allow` never survives a `deny`).
3. **arguments** — `sessionStorage["JSONUI_TEST_ARGS"]` (JSON).
4. **initialState** — `sessionStorage["JSONUI_TEST_INITIAL_STATE"]`:
   `{ "version": 1, "launchId": "<uuid>", "screens": { "<screenId>": { … } } }`.
5. **mocks** — the scenario set.
6. **one `reload`** (`goto` the file's starting URL on a `caseIsolation:
   "reopen"` case).
7. **receipt** — the screen confirms the payload on its state bridge; no
   receipt, or any rejected key, fails the cases with `failureReason: "setup"`.

Between steps 3 and 4 the runner calls the config hook `afterLaunch(page)`
when the harness passes one (awaited; a throw fails the launch like the other
steps). It runs on every launch — per case under `caseIsolation: "reopen"` —
and not at all for a file with nothing to launch with.

On web the payload also carries `writtenAt` (the page's `Date.now()` when it
was written). The generated hook consumes it only in a document whose
`performance.timeOrigin` is later — the document the reload / `goto` opens —
so a page still hydrating from before the launch cannot take it first; such
an older document leaves the payload untouched and shows no receipt.

At the end of each file the runner removes `JSONUI_TEST_ARGS` and
`JSONUI_TEST_INITIAL_STATE` from sessionStorage. The page must already be on
the app (not `about:blank`) when a file with a launch starts. Reading
`JSONUI_TEST_ARGS` in the app is the app's business.

**initialState** keys are the screen's Data names (the layout's `data`
section, top level); the generated hook applies them once after mount,
checks each value against the declared class and reports what it applied and
rejected (`not a data field`, `type mismatch: expected <class>`,
`null for non-optional <class>`, `unsupported type <class>`). A case-level
`initialState` needs `caseIsolation: "reopen"` (in a `shared` file that case
fails with `case-initial-state-needs-reopen`). In a flow,
`initialState.viewModels` is keyed by screen id and each screen is checked
the first time the flow reaches it; a referenced file's / case's own
initialState is not applied inside a flow (warning
`referenced-initial-state-ignored`).

**state** (`assert: "state"` and `when.state`) needs nothing from the
harness: the default provider reads `window.__JSONUI_STATE__[screenId].data`
— the screen under test; in a flow the step's `screen`, else the last one a
step named; inside a referenced file, that file's screen. A `stateProvider`
passed in the config still wins.

The receiving side and the bridge come from the code `jui build` generates
(rjui's `useJsonUITestBridge`, called by every generated ViewModel hook; a
hand-written page calls it itself) and run only while
`NODE_ENV !== 'production'`. A production build therefore fails a file with
an initialState with "no receipt" — by design.

### Harness: seed cookies in `afterLaunch`

`applyLaunchConfig` is gone (1.15.0): the runner applies `launch` itself, and
its `clearState` removes cookies and storage. Whatever the harness set up
before `runner.run()` and needs to survive a launch — an auth cookie, a
storage flag — goes in `afterLaunch`, which runs after the clearing and
before the page is reloaded:

```typescript
const runner = new JsonUITestRunner(page, {
  afterLaunch: async (page) => {
    await page.context().addCookies([{ name: 'session', value: token, url: baseUrl }]);
  },
});
```

(or `createRunner().afterLaunch(async (page) => { … }).build(page)`).

## Progress records

While a run is under way the runner appends one JSON line per event
(`schemas/progress.schema.json` in jsonui-test-runner, read by `jui viz`) to
`<JSONUI_TEST_PROGRESS_DIR>/<run>.jsonl`. With the variable unset, or naming a
directory that does not exist, nothing is written (the directory is never
created). Writing a line never changes a test's result.

- `run_start` / `run_end` — `runner.run(test)` on its own is a run of one
  file. A harness that runs several files through one runner brackets them:
  `runner.beginRun(files.length)` … `runner.endRun()`.
- `case_start` / `case_end` — one pair per attempt (`caseRetries`); a case
  that never runs is a single `case_end` with `attempt: 0`, `status:
  "skipped"`. A flow's body is its one case (`case: "flow"`).
  Every row results.json gets has its case lines — a row failed by launch /
  setup, or added for a failed teardown (`case: "teardown"`), is one failed
  attempt — so the last `case_end` of each row adds up to `run_end`.
- `file` is the test file relative to the `testsDir` config (default: the
  working directory); `test` / `case` are results.json's `testName` /
  `caseName`.

## Results files

Every run also writes its results — the `schemas/results.schema.json` shape —
to a default per-app folder, one new file per run, so `jui viz` can read past
runs. No variable or option is needed (unlike progress records, which stay
"no variable, no trace"; the asymmetry is deliberate):

```
<base>/web/<app>/<yyyyMMddTHHmmss.SSSZ>-<run>-<fileKey8>.json
```

- `<base>` is `$JSONUI_TEST_RESULTS_DIR` when it is an absolute path, else
  `~/.local/state/jsonui-test/results` (`XDG_STATE_HOME` is not used). The
  variable is host-side only: it moves this driver, the iOS driver (passed to
  xcodebuild as `TEST_RUNNER_JSONUI_TEST_RESULTS_DIR`) and `jui viz`; it has no
  effect on the Android driver, which writes on the device.
- `<app>` is `name` from `package.json` in the working directory when it is a
  non-empty string, else the working directory's folder name; every character
  outside `[A-Za-z0-9._-]` becomes `_`, and an empty or all-dot name becomes
  `unknown`.
- One run is one file: `runner.run(test)` on its own, or everything between
  `beginRun` and `endRun` (one suite per test file). `<run>` is the same run
  id the progress records carry; besides the usual keys the file has `run`,
  `app` (unsanitized) and, on each suite, `file` (the progress records'
  `file`). Those three keys appear only in these files. `<fileKey8>` is the
  first 8 hex digits of SHA-256 over the run's test files (the distinct
  `file` values, sorted, joined with a newline), so pruning can tell the
  results of one test file from another by name alone.
- The file is written as `.<name>.tmp` and renamed, so a reader never sees half
  a file. After each write the app folder is pruned. The latest result of every
  test file always stays, however old and however many other files ran since;
  14 days and 500 files apply only to results a newer one of the same test
  file replaced (and to names of the earlier shape, `<time>-<run>.json`). Only
  names of these forms are ever deleted; nothing else in the folder, and no
  other app's folder, is touched. The rule and its cases are jsonui-test-runner
  `specs/vectors/results-prune.json`, shared by the three drivers and `jui viz`.
- A failed write (e.g. an unwritable folder) prints one warning per process
  and never changes a test's result.

The web driver has no `resultsPath` option, so this write always happens.
`ResultsWriter.write(suites, path)` is unchanged (same file, no `run` / `app`
/ `file` keys); a harness that also calls it writes the results to two places,
which is fine.

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
