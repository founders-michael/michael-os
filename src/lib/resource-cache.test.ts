import assert from "node:assert/strict";
import test from "node:test";
import { cacheTtlSeconds, lifestyleInvalidationTags, resourceCacheTags, workInvalidationTags } from "@/lib/resource-cache";

test("resource cache TTLs stay bounded by resource type", () => {
  assert.equal(cacheTtlSeconds.organizationLists, 15);
  assert.equal(cacheTtlSeconds.taskLists, 45);
  assert.equal(cacheTtlSeconds.taskDashboard, 15);
  assert.equal(cacheTtlSeconds.capacity, 30);
  assert.equal(cacheTtlSeconds.calendar, 30);
  assert.equal(cacheTtlSeconds.calendarConflicts, 10);
  assert.ok(cacheTtlSeconds.teamLists > cacheTtlSeconds.taskLists);
});

test("WorkOS mutation tags cover dependent task, project, team, and capacity views", () => {
  const taskTags = workInvalidationTags.taskMutation("org-a", "task-a");
  assert.ok(taskTags.includes(resourceCacheTags.workTasks("org-a")));
  assert.ok(taskTags.includes(resourceCacheTags.workTask("org-a", "task-a")));
  assert.ok(taskTags.includes(resourceCacheTags.workCapacity("org-a")));

  const teamTags = workInvalidationTags.teamMutation("org-a", "team-a");
  assert.ok(teamTags.includes(resourceCacheTags.workTeams("org-a")));
  assert.ok(teamTags.includes(resourceCacheTags.workProjects("org-a")));
  assert.ok(teamTags.includes(resourceCacheTags.workTasks("org-a")));
  assert.ok(teamTags.includes(resourceCacheTags.workCapacity("org-a")));

  const projectTags = workInvalidationTags.projectMutation("org-a", "project-a");
  assert.ok(projectTags.includes(resourceCacheTags.workProject("org-a", "project-a")));
  assert.ok(projectTags.includes(resourceCacheTags.workTeams("org-a")));
  assert.ok(projectTags.includes(resourceCacheTags.workTasks("org-a")));
  assert.ok(projectTags.includes(resourceCacheTags.workCapacity("org-a")));

  const assignmentTags = workInvalidationTags.taskMutation("org-a", "task-a");
  assert.ok(assignmentTags.includes(resourceCacheTags.workCapacity("org-a")));
});

test("capacity and personal availability mutations invalidate dependent summaries", () => {
  const capacityTags = workInvalidationTags.capacityMutation("org-a", "member-a");
  assert.ok(capacityTags.includes(resourceCacheTags.workCapacity("org-a")));
  assert.ok(capacityTags.includes(resourceCacheTags.workMemberAvailability("org-a", "member-a")));

  const availabilityTags = lifestyleInvalidationTags.availabilityMutation("user-a");
  assert.ok(availabilityTags.includes(resourceCacheTags.lifestyleAvailability("user-a")));
  assert.ok(availabilityTags.includes(resourceCacheTags.lifestyleCalendar("user-a")));
});

test("organization access changes invalidate all tenant-scoped visibility caches", () => {
  const tags = workInvalidationTags.accessChange("org-a");
  assert.ok(tags.includes(resourceCacheTags.workTeams("org-a")));
  assert.ok(tags.includes(resourceCacheTags.workProjects("org-a")));
  assert.ok(tags.includes(resourceCacheTags.workTasks("org-a")));
  assert.ok(tags.includes(resourceCacheTags.workCapacity("org-a")));
  assert.ok(!tags.includes(resourceCacheTags.workTasks("org-b")));
});

test("LifestyleOS invalidation is confined to the affected user and domain", () => {
  const tags = lifestyleInvalidationTags.taskMutation("user-a", "task-a");
  assert.ok(tags.includes(resourceCacheTags.lifestyleTasks("user-a")));
  assert.ok(tags.includes(resourceCacheTags.lifestyleTask("user-a", "task-a")));
  assert.ok(tags.includes(resourceCacheTags.lifestyleCalendar("user-a")));
  assert.ok(!tags.includes(resourceCacheTags.lifestyleTasks("user-b")));
  assert.ok(!tags.includes(resourceCacheTags.workTasks("org-a")));
});

