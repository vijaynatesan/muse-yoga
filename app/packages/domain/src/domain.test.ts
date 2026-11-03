import { test } from "node:test";
import assert from "node:assert/strict";
import { matchReady, normalizeName, nameMatches, decideRegOtp, onLoginFail, admitDevice, transitionAsana, feedbackAllowed, DEFAULT_LIMITS, pickBestSet, canDeleteStep, canAddStep, deleteStepAt, insertStepAfter, moveStep, acceptBlockReason, stepTextCheckHeuristic, type DraftStep } from "./index.ts";

test("voice matcher accepts POC phrases", () => {
  assert.equal(matchReady("ready").matched, true);
  assert.equal(matchReady("I'm ready").matched, true);
  assert.equal(matchReady("I am ready").matched, true);
  assert.equal(matchReady("let us start").matched, true);
  assert.equal(matchReady("let's start").matched, true);
});
test("voice matcher rejects traps (S8.1)", () => {
  assert.equal(matchReady("already").matched, false);
  assert.equal(matchReady("not ready").matched, false);
  assert.equal(matchReady("let us stop").matched, false);
  assert.equal(matchReady("hello there").matched, false);
  assert.equal(matchReady("").matched, false);
});
test("search normalisation (A4)", () => {
  assert.equal(nameMatches("Vrikshasana", "Vṛkṣāsana"), true);
  assert.equal(nameMatches("Tadasana", "Tāḍāsana"), true);
  assert.equal(normalizeName("Vṛkṣāsana"), normalizeName("Vrikshasana"));
});
test("registration OTP lifetime (S1.2)", () => {
  assert.equal(decideRegOtp(2, false, DEFAULT_LIMITS).allowed, true);
  assert.equal(decideRegOtp(3, false, DEFAULT_LIMITS).allowed, false);
});
test("login lock state machine (S1.3/S1.4)", () => {
  assert.equal(onLoginFail(2, 0, DEFAULT_LIMITS).outcome, "locked");
  assert.equal(onLoginFail(2, 1, DEFAULT_LIMITS).outcome, "permanently_blocked");
});
test("device cap", () => {
  assert.equal(admitDevice(2, DEFAULT_LIMITS), true);
  assert.equal(admitDevice(3, DEFAULT_LIMITS), false);
});
test("asana state machine: rejected cannot resubmit", () => {
  assert.equal(transitionAsana("rejected", "submit").ok, false);
  assert.equal(transitionAsana("active", "submit").next, "pending");
  assert.equal(transitionAsana("pending", "approve").next, "public");
});
test("feedback limit + best set", () => {
  assert.equal(feedbackAllowed(3, DEFAULT_LIMITS), false);
  assert.equal(pickBestSet([{ set: 1, deviceIds: ["a"] }, { set: 2, deviceIds: ["a", "b"] }]), 2);
});

// ---- admin step editing (C16) ----
const mk = (...ids: string[]): DraftStep[] => ids.map((sid) => ({ sid, instruction: `text ${sid}`, durationS: 20, imageStatus: "fresh" as const, imageKey: `k-${sid}` }));
test("delete removes exactly one step; the rest keep content and order, later steps shift up", () => {
  const out = deleteStepAt(mk("a", "b", "c", "d", "e", "f"), "c");
  assert.deepEqual(out.map((s) => s.sid), ["a", "b", "d", "e", "f"]);
  assert.equal(out[2].instruction, "text d"); assert.equal(out[2].imageKey, "k-d");   // old step 4 is now position 3, untouched
  assert.deepEqual(deleteStepAt(mk("a", "b"), "zzz").map((s) => s.sid), ["a", "b"]);  // unknown id: nothing deleted
});
test("insert after a step, at the start, and ignore unknown anchor", () => {
  const n: DraftStep = { sid: "x", instruction: "new", durationS: 10, imageStatus: "none" };
  assert.deepEqual(insertStepAfter(mk("a", "b", "c"), "b", n).map((s) => s.sid), ["a", "b", "x", "c"]);
  assert.deepEqual(insertStepAfter(mk("a", "b"), null, n).map((s) => s.sid), ["x", "a", "b"]);
  assert.deepEqual(insertStepAfter(mk("a", "b"), "nope", n).map((s) => s.sid), ["a", "b"]);
});
test("move up/down swaps neighbours and stops at the ends", () => {
  assert.deepEqual(moveStep(mk("a", "b", "c"), "b", "up").map((s) => s.sid), ["b", "a", "c"]);
  assert.deepEqual(moveStep(mk("a", "b", "c"), "b", "down").map((s) => s.sid), ["a", "c", "b"]);
  assert.deepEqual(moveStep(mk("a", "b", "c"), "a", "up").map((s) => s.sid), ["a", "b", "c"]);
  assert.deepEqual(moveStep(mk("a", "b", "c"), "c", "down").map((s) => s.sid), ["a", "b", "c"]);
});
test("step count limits come from settings (2-12 by default)", () => {
  assert.equal(DEFAULT_LIMITS.minSteps, 2); assert.equal(DEFAULT_LIMITS.maxSteps, 12);
  assert.equal(canDeleteStep(3, DEFAULT_LIMITS), true); assert.equal(canDeleteStep(2, DEFAULT_LIMITS), false);
  assert.equal(canAddStep(11, DEFAULT_LIMITS), true); assert.equal(canAddStep(12, DEFAULT_LIMITS), false);
  assert.equal(canDeleteStep(5, { minSteps: 5 }), false);
});
test("accept is blocked while any image is stale/failed/missing or the count is out of range", () => {
  assert.equal(acceptBlockReason(mk("a", "b", "c"), DEFAULT_LIMITS), null);
  const stale = mk("a", "b", "c"); stale[1].imageStatus = "stale";
  assert.match(acceptBlockReason(stale, DEFAULT_LIMITS)!, /Step 2 has no up-to-date image \(stale\)/);
  assert.match(acceptBlockReason(mk("a"), DEFAULT_LIMITS)!, /at least 2/);
  assert.match(acceptBlockReason(mk(...Array.from({ length: 13 }, (_, i) => "s" + i)), DEFAULT_LIMITS)!, /at most 12/);
});
test("step text heuristic: needs a real pose-sized instruction", () => {
  assert.equal(stepTextCheckHeuristic("Raise both arms overhead and join the palms.").ok, true);
  assert.equal(stepTextCheckHeuristic("hi").ok, false);
  assert.equal(stepTextCheckHeuristic("buy my course at www.example.com").ok, false);
  assert.equal(stepTextCheckHeuristic("x".repeat(401)).ok, false);
});
