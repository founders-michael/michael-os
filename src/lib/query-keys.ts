export const queryKeys = {
  lifestyle: {
    taskSummary: (userId: string) => ["lifestyle", userId, "task-summary"] as const,
    taskList: (userId: string, filters: Record<string, unknown>) => ["lifestyle", userId, "tasks", filters] as const,
    habitSummary: (userId: string) => ["lifestyle", userId, "habit-summary"] as const,
    goals: (userId: string, filters: Record<string, unknown> = {}) => ["lifestyle", userId, "goals", filters] as const,
    calendar: (userId: string, range: { from: string; to: string; timeZone: string }) => ["lifestyle", userId, "calendar", range] as const,
  },
  work: {
    organization: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId] as const,
    teams: (organizationId: string, userId: string, filters: Record<string, unknown> = {}) => ["work", userId, "organization", organizationId, "teams", filters] as const,
    projects: (organizationId: string, userId: string, filters: Record<string, unknown> = {}) => ["work", userId, "organization", organizationId, "projects", filters] as const,
    tasks: (organizationId: string, userId: string, filters: Record<string, unknown> = {}) => ["work", userId, "organization", organizationId, "tasks", filters] as const,
    task: (organizationId: string, userId: string, taskId: string) => ["work", userId, "organization", organizationId, "task", taskId] as const,
    capacity: (organizationId: string, userId: string, filters: Record<string, unknown> = {}) => ["work", userId, "organization", organizationId, "capacity", filters] as const,
  },
} as const;
