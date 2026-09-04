/**
 * JsonUI Test Runner - Web Driver
 * Classifies a thrown error into the `failureReason` vocabulary
 * (schemas/results.schema.json).
 */
import { FailureReason } from '../models/types';
/**
 * Derive the reason from the error a case actually failed with.
 *
 * Returns undefined when there is nothing to classify — absent must read as
 * "unknown", never as "no reason".
 *
 * ⚠️ This driver emits a SUBSET of the vocabulary, and that is a fact about
 * the driver rather than about the apps it runs. It throws a bare `Error` at
 * 80 sites, so an error object carries no stage: only the two named classes
 * can be told apart by type. `element-not-found`, `timeout`, `assertion`,
 * `mock` and `launch` are therefore never produced here, and a consumer
 * counting reasons across platforms has to read their absence as "not
 * distinguished here" rather than as zero.
 *
 * The fix is to give those throw sites named error classes, which is a change
 * to 80 call sites and is not this one. Classifying by matching the message
 * text is the exact practice this field exists to end, and it would be no
 * more durable inside the driver than outside it.
 */
export declare function classifyFailure(error: unknown): FailureReason | undefined;
//# sourceMappingURL=failureReason.d.ts.map