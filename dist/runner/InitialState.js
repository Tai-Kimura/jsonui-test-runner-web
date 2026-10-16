"use strict";
/**
 * JsonUI Test Runner - Web Driver
 * initialState: which launches a file makes and what each one carries
 * (spec §10.2, fixed by specs/vectors/initial-state-payload.json).
 *
 * The driver does not judge the values. An unknown key, a null or a value of
 * the wrong type travels in the payload as written; the app checks it against
 * the screen's Data and reports what it rejected through the state bridge,
 * and the driver fails on that report (StateBridge.waitForReceipt).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFERENCED_INITIAL_STATE_IGNORED = exports.CASE_INITIAL_STATE_NEEDS_REOPEN = exports.INITIAL_STATE_KEY = void 0;
exports.caseHasInitialState = caseHasInitialState;
exports.screenTestScreens = screenTestScreens;
exports.flowScreens = flowScreens;
exports.launchNeeded = launchNeeded;
exports.caseNeedsReopen = caseNeedsReopen;
exports.caseNeedsReopenMessage = caseNeedsReopenMessage;
exports.referencedInitialStateWarnings = referencedInitialStateWarnings;
exports.referencedInitialStateMessage = referencedInitialStateMessage;
exports.makePayload = makePayload;
exports.writeInitialState = writeInitialState;
exports.planLaunches = planLaunches;
const crypto_1 = require("crypto");
const screenIdentity_1 = require("./screenIdentity");
/** sessionStorage key the app reads the payload from. */
exports.INITIAL_STATE_KEY = 'JSONUI_TEST_INITIAL_STATE';
/** Codes shared with the other drivers and `jsonui-test validate` (spec §10.7). */
exports.CASE_INITIAL_STATE_NEEDS_REOPEN = 'case-initial-state-needs-reopen';
exports.REFERENCED_INITIAL_STATE_IGNORED = 'referenced-initial-state-ignored';
function nonEmpty(viewModel) {
    return !!viewModel && typeof viewModel === 'object' && Object.keys(viewModel).length > 0;
}
/** True when the case writes a non-empty initialState of its own. */
function caseHasInitialState(testCase) {
    return nonEmpty(testCase.initialState?.viewModel);
}
/**
 * The screens a screen test's launch carries: the screen under test with the
 * file's viewModel, merged key by key (shallow) with the case's when a case is
 * given (reopen). Null when there is nothing to deliver — an empty viewModel is
 * the same as none.
 */
function screenTestScreens(test, testCase) {
    const merged = {
        ...(test.initialState?.viewModel ?? {}),
        ...(testCase?.initialState?.viewModel ?? {})
    };
    if (!nonEmpty(merged))
        return null;
    const screenId = (0, screenIdentity_1.screenIdFromLayout)(test.source?.layout);
    if (!screenId) {
        throw new Error(`initialState needs the screen under test, and no screen id could be derived from ` +
            `source.layout ('${test.source?.layout ?? '(absent)'}').`);
    }
    return { [screenId]: merged };
}
/** A flow's payload screens: `initialState.viewModels` as written, or null when empty. */
function flowScreens(test) {
    const viewModels = test.initialState?.viewModels;
    if (!viewModels || Object.keys(viewModels).length === 0)
        return null;
    return { ...viewModels };
}
/** A launch happens only for a `launch`, `mocks` or a payload (spec §10.2). */
function launchNeeded(test, screens) {
    return test.launch !== undefined || test.mocks !== undefined || screens !== null;
}
/** A case-level initialState in a `shared` file cannot be delivered. */
function caseNeedsReopen(test, testCase) {
    return (test.caseIsolation ?? 'shared') === 'shared' && caseHasInitialState(testCase);
}
function caseNeedsReopenMessage(caseName) {
    return (`[${exports.CASE_INITIAL_STATE_NEEDS_REOPEN}] case '${caseName}' declares its own initialState, ` +
        "which a 'shared' file cannot deliver: the screen is opened once, before the first case. " +
        "Set caseIsolation: 'reopen' on the file, or move the values to the file's initialState.");
}
/**
 * What a flow's file reference would have delivered and does not: the
 * referenced file's own initialState and that of each case the step runs. The
 * flow's launch has already happened, so they are ignored and warned about.
 */
function referencedInitialStateWarnings(step, referenced) {
    const file = step.file;
    const warnings = [];
    if (nonEmpty(referenced.initialState?.viewModel)) {
        warnings.push({ code: exports.REFERENCED_INITIAL_STATE_IGNORED, file });
    }
    const names = step.case !== undefined
        ? [step.case]
        : step.cases && step.cases.length > 0
            ? step.cases
            : referenced.cases.map(c => c.name);
    for (const name of names) {
        const testCase = referenced.cases.find(c => c.name === name);
        if (testCase && caseHasInitialState(testCase)) {
            warnings.push({ code: exports.REFERENCED_INITIAL_STATE_IGNORED, file, case: name });
        }
    }
    return warnings;
}
function referencedInitialStateMessage(w) {
    const what = w.case !== undefined ? `case '${w.case}' of '${w.file}'` : `'${w.file}'`;
    return (`[${exports.REFERENCED_INITIAL_STATE_IGNORED}] the initialState of ${what} is not applied inside a flow ` +
        "(the flow's launch has already happened); put the values in the flow's initialState.viewModels.");
}
function makePayload(screens) {
    return { version: 1, launchId: (0, crypto_1.randomUUID)(), screens };
}
/**
 * Write the payload to sessionStorage, stamped with `writtenAt` (the page's
 * `Date.now()`), or remove a stale one when this launch carries none. Step 4
 * of the launch sequence: after arguments (and afterLaunch), before mocks.
 */
async function writeInitialState(page, payload) {
    await page.evaluate(([key, json]) => {
        if (json === null) {
            window.sessionStorage.removeItem(key);
            return;
        }
        const stamped = { ...JSON.parse(json), writtenAt: Date.now() };
        window.sessionStorage.setItem(key, JSON.stringify(stamped));
    }, [exports.INITIAL_STATE_KEY, payload === null ? null : JSON.stringify(payload)]);
}
/**
 * The launches a file makes, in order, with the cases failed before running
 * and the warnings. Built from the same functions the runner calls; the only
 * case gate it models is `skip` (platform / responsive need a live page).
 */
function planLaunches(test, resolveFile = () => { throw new Error('no referenced files'); }) {
    const plan = { launches: [], caseFailures: [], warnings: [] };
    if (test.type === 'flow') {
        const screens = flowScreens(test);
        if (launchNeeded(test, screens))
            plan.launches.push({ before: 'file', screens });
        for (const step of [...(test.setup ?? []), ...test.steps, ...(test.teardown ?? [])]) {
            if (step.file !== undefined) {
                plan.warnings.push(...referencedInitialStateWarnings(step, resolveFile(step.file)));
            }
        }
        return plan;
    }
    if (test.caseIsolation === 'reopen') {
        for (const testCase of test.cases) {
            if (testCase.skip)
                continue;
            plan.launches.push({ before: `case:${testCase.name}`, screens: screenTestScreens(test, testCase) });
        }
        return plan;
    }
    const screens = screenTestScreens(test);
    if (launchNeeded(test, screens))
        plan.launches.push({ before: 'file', screens });
    for (const testCase of test.cases) {
        if (testCase.skip)
            continue;
        if (caseNeedsReopen(test, testCase)) {
            plan.caseFailures.push({ case: testCase.name, failureReason: 'setup', code: exports.CASE_INITIAL_STATE_NEEDS_REOPEN });
        }
    }
    return plan;
}
//# sourceMappingURL=InitialState.js.map