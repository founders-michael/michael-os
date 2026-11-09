import test from "node:test";
import assert from "node:assert/strict";
import { getWorkTaskDrop, statusFromWorkTaskDropId, workTaskBoardDropId } from "@/lib/work-task-board-dnd";

test("board drop ids map only to supported task statuses", () => {
  assert.equal(statusFromWorkTaskDropId(workTaskBoardDropId("IN_PROGRESS")), "IN_PROGRESS");
  assert.equal(statusFromWorkTaskDropId("other:IN_PROGRESS"), null);
  assert.equal(statusFromWorkTaskDropId("work-task-status:UNKNOWN"), null);
  assert.equal(statusFromWorkTaskDropId(undefined), null);
});

test("cancelled drags and invalid targets do not produce a status update", () => {
  assert.equal(getWorkTaskDrop("TODO", true), null);
  assert.equal(statusFromWorkTaskDropId("invalid-target"), null);
});
