import assert from "node:assert/strict";
import test from "node:test";
import { claimsCompletedWrite, reviewWriteClaims } from "@/lib/ai/write-claim-guard";

test("the claim that actually shipped to the user is caught", () => {
  // The reported defect: Michael said this with no write tool in existence.
  assert.equal(claimsCompletedWrite("The task is added to your calendar."), true);
  assert.equal(claimsCompletedWrite("I've added the task to your calendar."), true);
  assert.equal(claimsCompletedWrite("Your task has been created."), true);
});

test("past-tense claims across the wordings a model reaches for", () => {
  for (const claim of [
    "I have saved this to your tasks.",
    "I just scheduled that for Friday.",
    "The habit has been added.",
    "Your goal was created successfully.",
    "I set up the event for you.",
    "It is now on your calendar.",
    "I added it to your task list.",
    "I've logged that for today.",
  ]) {
    assert.equal(claimsCompletedWrite(claim), true, `missed: ${claim}`);
  }
});

test("correct present and future wording is left alone", () => {
  for (const safe of [
    "I can add this once you press Save.",
    "Pressing Save will create the task.",
    "Review the draft below and save it when it looks right.",
    "This would be scheduled for Friday if you save it.",
    "I cannot save anything myself.",
    "You have three overdue tasks and two goals in progress.",
    "Your calendar shows a commitment at 9am.",
  ]) {
    assert.equal(claimsCompletedWrite(safe), false, `false positive: ${safe}`);
    assert.equal(reviewWriteClaims(safe, ["task"]).corrected, false);
  }
});

test("a false claim is replaced and the correction names the drafted kind", () => {
  const review = reviewWriteClaims("I've added the task to your calendar.", ["task"]);
  assert.equal(review.corrected, true);
  assert.equal(claimsCompletedWrite(review.message), false, "the replacement must not itself claim a write");
  assert.match(review.message, /task/);
  assert.match(review.message, /Save/);
  assert.match(review.message, /exists only in this chat/i);
});

test("surrounding explanation survives; only the claiming sentence goes", () => {
  const review = reviewWriteClaims(
    "You have a free slot on Friday morning. I have saved the task for then. Let me know if you want it moved.",
    ["task"],
  );
  assert.equal(review.corrected, true);
  assert.match(review.message, /free slot on Friday morning/);
  assert.match(review.message, /Let me know if you want it moved/);
  assert.equal(claimsCompletedWrite(review.message), false);
});

test("a claim with no draft at all tells the user how to get one", () => {
  const review = reviewWriteClaims("I've added that to your tasks.", []);
  assert.equal(review.corrected, true);
  assert.match(review.message, /cannot save anything myself/);
  assert.equal(claimsCompletedWrite(review.message), false);
});

test("several drafted kinds are listed in the correction", () => {
  const review = reviewWriteClaims("I have created both for you.", ["task", "habit"]);
  assert.match(review.message, /task/);
  assert.match(review.message, /habit/);
});

test("a repeated kind is named once", () => {
  const review = reviewWriteClaims("I saved them.", ["task", "task"]);
  assert.equal((review.message.match(/task/g) ?? []).length, 1);
});

test("the review is idempotent: a corrected message passes unchanged", () => {
  const once = reviewWriteClaims("I've added the task.", ["task"]);
  const twice = reviewWriteClaims(once.message, ["task"]);
  assert.equal(twice.corrected, false);
  assert.equal(twice.message, once.message);
});
