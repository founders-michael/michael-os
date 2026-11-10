import type { CacheNamespace } from "@/lib/server-cache-core";

function scopedCacheTag(namespace: CacheNamespace, resource: string) {
  return `${namespace}:${resource}`;
}

export const cacheTtlSeconds = {
  organizationLists: 15,
  teamLists: 90,
  projectLists: 90,
  resourceDetails: 45,
  taskLists: 45,
  taskDetails: 45,
  taskDashboard: 15,
  capacity: 30,
  personalLists: 90,
  personalSummaries: 45,
  calendar: 30,
  calendarConflicts: 10,
  availability: 20,
} as const;

export const resourceCacheTags = {
  organizationList: (userId: string) => scopedCacheTag("organization", `user:${userId}:organizations`),
  workTasks: (organizationId: string) => scopedCacheTag("task", `organization:${organizationId}:tasks`),
  workTask: (organizationId: string, taskId: string) => scopedCacheTag("task", `organization:${organizationId}:task:${taskId}`),
  workTeams: (organizationId: string) => scopedCacheTag("team", `organization:${organizationId}:teams`),
  workTeam: (organizationId: string, teamId: string) => scopedCacheTag("team", `organization:${organizationId}:team:${teamId}`),
  workProjects: (organizationId: string) => scopedCacheTag("project", `organization:${organizationId}:projects`),
  workProject: (organizationId: string, projectId: string) => scopedCacheTag("project", `organization:${organizationId}:project:${projectId}`),
  workCapacity: (organizationId: string) => scopedCacheTag("capacity", `organization:${organizationId}:capacity`),
  workMemberAvailability: (organizationId: string, userId: string) => scopedCacheTag("capacity", `organization:${organizationId}:member:${userId}:availability`),
  lifestyleTasks: (userId: string) => scopedCacheTag("lifestyle", `user:${userId}:tasks`),
  lifestyleTask: (userId: string, taskId: string) => scopedCacheTag("lifestyle", `user:${userId}:task:${taskId}`),
  lifestyleGoals: (userId: string) => scopedCacheTag("lifestyle", `user:${userId}:goals`),
  lifestyleGoal: (userId: string, goalId: string) => scopedCacheTag("lifestyle", `user:${userId}:goal:${goalId}`),
  lifestyleHabits: (userId: string) => scopedCacheTag("lifestyle", `user:${userId}:habits`),
  lifestyleHabit: (userId: string, habitId: string) => scopedCacheTag("lifestyle", `user:${userId}:habit:${habitId}`),
  lifestyleCalendar: (userId: string) => scopedCacheTag("lifestyle", `user:${userId}:calendar`),
  lifestyleAvailability: (userId: string) => scopedCacheTag("lifestyle", `user:${userId}:availability`),
};

export const workInvalidationTags = {
  accessChange: (organizationId: string) => [
    resourceCacheTags.workTeams(organizationId),
    resourceCacheTags.workProjects(organizationId),
    resourceCacheTags.workTasks(organizationId),
    resourceCacheTags.workCapacity(organizationId),
  ],
  taskMutation: (organizationId: string, taskId?: string) => [
    resourceCacheTags.workTasks(organizationId),
    resourceCacheTags.workCapacity(organizationId),
    ...(taskId ? [resourceCacheTags.workTask(organizationId, taskId)] : []),
  ],
  teamMutation: (organizationId: string, teamId?: string) => [
    resourceCacheTags.workTeams(organizationId),
    resourceCacheTags.workProjects(organizationId),
    resourceCacheTags.workTasks(organizationId),
    resourceCacheTags.workCapacity(organizationId),
    ...(teamId ? [resourceCacheTags.workTeam(organizationId, teamId)] : []),
  ],
  projectMutation: (organizationId: string, projectId?: string) => [
    resourceCacheTags.workProjects(organizationId),
    resourceCacheTags.workTeams(organizationId),
    resourceCacheTags.workTasks(organizationId),
    resourceCacheTags.workCapacity(organizationId),
    ...(projectId ? [resourceCacheTags.workProject(organizationId, projectId)] : []),
  ],
  capacityMutation: (organizationId: string, userId?: string) => [
    resourceCacheTags.workCapacity(organizationId),
    ...(userId ? [resourceCacheTags.workMemberAvailability(organizationId, userId)] : []),
  ],
};

export const lifestyleInvalidationTags = {
  taskMutation: (userId: string, taskId?: string) => [
    resourceCacheTags.lifestyleTasks(userId),
    ...(taskId ? [resourceCacheTags.lifestyleTask(userId, taskId)] : []),
    resourceCacheTags.lifestyleCalendar(userId),
  ],
  goalMutation: (userId: string, goalId?: string) => [
    resourceCacheTags.lifestyleGoals(userId),
    ...(goalId ? [resourceCacheTags.lifestyleGoal(userId, goalId)] : []),
  ],
  habitMutation: (userId: string, habitId?: string) => [
    resourceCacheTags.lifestyleHabits(userId),
    ...(habitId ? [resourceCacheTags.lifestyleHabit(userId, habitId)] : []),
  ],
  calendarMutation: (userId: string) => [resourceCacheTags.lifestyleCalendar(userId)],
  availabilityMutation: (userId: string) => [
    resourceCacheTags.lifestyleAvailability(userId),
    resourceCacheTags.lifestyleCalendar(userId),
  ],
};
