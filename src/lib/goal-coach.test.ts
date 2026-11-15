import test from "node:test";
import assert from "node:assert/strict";
import { goalCoachRead } from "@/lib/goal-coach";

const milestones = [
  { title: "Roadmap", status: "COMPLETED" }, { title: "Architecture", status: "COMPLETED" },
  { title: "Coding", status: "PENDING" }, { title: "Deployment", status: "PENDING" }, { title: "Testing", status: "PENDING" },
];

test("compares manual progress with milestones and names the next step", () => {
  const read = goalCoachRead({ title: "Platform", status: "ACTIVE", progress: 55, targetDate: "2026-11-01", milestones }, "2026-11-15");
  assert.equal(read.milestonePercent, 40);
  assert.equal(read.nextMilestone, "Coding");
  assert.equal(read.targetPassed, true);
  assert.equal(read.progressDrift, true);
  assert.equal(read.text, "Your manual progress (55%) is ahead of your milestones (40%). Coding is the next step. The target date has passed, so it may be worth choosing a new one.");
});

test("in-step progress, no target concerns", () => {
  const read = goalCoachRead({ title: "Platform", status: "ACTIVE", progress: 45, targetDate: "2027-01-01", milestones }, "2026-11-15");
  assert.equal(read.progressDrift, false);
  assert.equal(read.targetPassed, false);
  assert.equal(read.text, "2 of 5 milestones are done, in step with your 45% progress. Coding is the next step.");
});

test("a goal without milestones, and a completed goal's past target is not flagged", () => {
  const read = goalCoachRead({ title: "Read more", status: "COMPLETED", progress: 100, targetDate: "2026-01-01", milestones: [] }, "2026-11-15");
  assert.equal(read.milestonePercent, null);
  assert.equal(read.nextMilestone, null);
  assert.equal(read.targetPassed, false);
  assert.match(read.text, /no milestones yet/);
});
