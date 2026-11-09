import assert from "node:assert/strict";
import test from "node:test";
import { canCreateWorkTask, canEditWorkTask, canManageWorkTask, canViewWorkTask, isStatusOnlyUpdate, wouldCreateDependencyCycle, type WorkTaskActorScope, type WorkTaskScope } from "./work-task-permissions";

const manager: WorkTaskActorScope = { userId: "manager", role: "MANAGER", managerScope: "TEAM", teamIds: ["team-a"], teamLeadIds: [], projectIds: [], projectOwnerIds: [] };
const task: WorkTaskScope = { id: "task-a", createdById: "member-a", projectId: null, teamId: "team-a", assignedUserIds: [] };

test("team-scoped manager access is limited to their assigned team", () => {
  assert.equal(canViewWorkTask(manager, task), true);
  assert.equal(canManageWorkTask(manager, task), true);
  assert.equal(canViewWorkTask(manager, { ...task, teamId: "team-b" }), false);
  assert.equal(canManageWorkTask(manager, { ...task, teamId: "team-b" }), false);
});

test("members can see their own work and create only within an assigned scope", () => {
  const member = { ...manager, role: "MEMBER" as const, teamIds: ["team-a"] };
  assert.equal(canViewWorkTask(member, task), true);
  assert.equal(canEditWorkTask(member, task), false);
  assert.equal(canManageWorkTask(member, { ...task, createdById: member.userId }), false);
  assert.equal(canEditWorkTask(member, { ...task, createdById: member.userId }), true);
  assert.equal(canCreateWorkTask(member, "team-a", null), true);
  assert.equal(canCreateWorkTask(member, null, null), false);
});

test("assigned members may be limited to status-only updates", () => {
  assert.equal(isStatusOnlyUpdate({ status: "IN_PROGRESS" }), true);
  assert.equal(isStatusOnlyUpdate({ status: "DONE", priority: "URGENT" }), false);
});

test("dependency cycle detection handles paths and self-dependencies", () => {
  const edges = [{ taskId: "a", dependsOnTaskId: "b" }, { taskId: "b", dependsOnTaskId: "c" }];
  assert.equal(wouldCreateDependencyCycle(edges, "c", "a"), true);
  assert.equal(wouldCreateDependencyCycle(edges, "a", "c"), false);
  assert.equal(wouldCreateDependencyCycle(edges, "a", "a"), true);
});
