import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceTurnProgress, PRESENCE_LABELS, PRESENCE_STATES, presenceDescription, presenceStateFor,
  TURN_ACCEPTED, type PresenceSignals, type TurnProgress,
} from "@/lib/ai/assistant-presence";

const quiet: PresenceSignals = {
  requestInFlight: false, turn: null, revealing: false, failed: false, pendingApprovals: 0, userComposing: false,
};

test("a turn with tools moves accepted → tool → composing, and records each tool's outcome", () => {
  let progress: TurnProgress | null = TURN_ACCEPTED;
  progress = advanceTurnProgress(progress, { type: "tool-start", name: "get_my_tasks" });
  assert.deepEqual(progress, { phase: "tool", tools: [{ name: "get_my_tasks", status: "running" }] });
  progress = advanceTurnProgress(progress, { type: "tool-end", name: "get_my_tasks", status: "completed" });
  progress = advanceTurnProgress(progress, { type: "tool-start", name: "get_my_calendar" });
  progress = advanceTurnProgress(progress, { type: "tool-end", name: "get_my_calendar", status: "failed" });
  progress = advanceTurnProgress(progress, { type: "composing" });
  assert.deepEqual(progress, {
    phase: "composing",
    tools: [{ name: "get_my_tasks", status: "completed" }, { name: "get_my_calendar", status: "failed" }],
  });
});

test("the same tool run twice keeps two entries, each closed by its own end event", () => {
  let progress: TurnProgress | null = TURN_ACCEPTED;
  progress = advanceTurnProgress(progress, { type: "tool-start", name: "get_my_tasks" });
  progress = advanceTurnProgress(progress, { type: "tool-end", name: "get_my_tasks", status: "completed" });
  progress = advanceTurnProgress(progress, { type: "tool-start", name: "get_my_tasks" });
  assert.deepEqual(progress?.tools, [{ name: "get_my_tasks", status: "completed" }, { name: "get_my_tasks", status: "running" }]);
});

test("ping, message and error leave progress untouched; accepted never resets a turn already under way", () => {
  const running: TurnProgress = { phase: "tool", tools: [{ name: "get_my_goals", status: "running" }] };
  assert.equal(advanceTurnProgress(running, { type: "ping" }), running);
  assert.equal(advanceTurnProgress(running, { type: "error", code: "X", message: "x" }), running);
  assert.equal(advanceTurnProgress(running, { type: "message", content: "hi", toolActivity: [], usedSavedData: false }), running);
  assert.equal(advanceTurnProgress(running, { type: "accepted" }), running);
  assert.deepEqual(advanceTurnProgress(null, { type: "accepted" }), TURN_ACCEPTED);
});

test("in flight: a running tool is executing, composing is responding, anything else is thinking", () => {
  assert.equal(presenceStateFor({ ...quiet, requestInFlight: true }), "thinking");
  assert.equal(presenceStateFor({ ...quiet, requestInFlight: true, turn: TURN_ACCEPTED }), "thinking");
  assert.equal(presenceStateFor({ ...quiet, requestInFlight: true, turn: { phase: "tool", tools: [{ name: "a", status: "running" }] } }), "executing");
  // Between tools — the last one finished, the model is deciding what next.
  assert.equal(presenceStateFor({ ...quiet, requestInFlight: true, turn: { phase: "tool", tools: [{ name: "a", status: "completed" }] } }), "thinking");
  assert.equal(presenceStateFor({ ...quiet, requestInFlight: true, turn: { phase: "composing", tools: [] } }), "responding");
});

test("a tool started after composing is executing again: the model may look up more", () => {
  let progress: TurnProgress | null = TURN_ACCEPTED;
  progress = advanceTurnProgress(progress, { type: "composing" });
  progress = advanceTurnProgress(progress, { type: "tool-start", name: "get_my_habits" });
  assert.equal(presenceStateFor({ ...quiet, requestInFlight: true, turn: progress }), "executing");
});

test("being in flight outranks every page fact", () => {
  assert.equal(presenceStateFor({ ...quiet, requestInFlight: true, failed: true, pendingApprovals: 2, userComposing: true, revealing: true }), "thinking");
});

test("after the reply: revealing, then error, then pending approvals, then typing, then idle", () => {
  assert.equal(presenceStateFor({ ...quiet, revealing: true, failed: true, pendingApprovals: 1, userComposing: true }), "responding");
  assert.equal(presenceStateFor({ ...quiet, failed: true, pendingApprovals: 1, userComposing: true }), "error");
  assert.equal(presenceStateFor({ ...quiet, pendingApprovals: 1, userComposing: true }), "awaiting_approval");
  assert.equal(presenceStateFor({ ...quiet, userComposing: true }), "listening");
  assert.equal(presenceStateFor(quiet), "idle");
});

test("every state has a visible label and an accessible description", () => {
  for (const state of PRESENCE_STATES) {
    assert.ok(PRESENCE_LABELS[state].length > 0, state);
    assert.match(presenceDescription(state), /^Michael /, state);
  }
});
