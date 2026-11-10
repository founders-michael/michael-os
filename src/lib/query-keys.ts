/**
 * Query keys are deliberately scoped by product and authenticated identity.
 * They are a browser-cache partition, never an authorization claim.
 */
export type QueryFilters = Record<string, unknown>;
export type CalendarRange = { from: string; to: string; timeZone: string };

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]));
  }
  return value;
}

export function normalizeQueryInput<T extends QueryFilters>(input: T = {} as T): T {
  return normalize(input) as T;
}

export function stableQueryInput(input: QueryFilters = {}): string {
  return JSON.stringify(normalizeQueryInput(input));
}

export const queryKeys = {
  lifestyle: {
    root: (userId: string) => ["lifestyle", userId] as const,
    tasksRoot: (userId: string) => ["lifestyle", userId, "tasks"] as const,
    taskSummary: (userId: string) => ["lifestyle", userId, "task-summary"] as const,
    taskList: (userId: string, filters: QueryFilters = {}) => ["lifestyle", userId, "tasks", normalizeQueryInput(filters)] as const,
    task: (userId: string, taskId: string) => ["lifestyle", userId, "task", taskId] as const,
    goalsRoot: (userId: string) => ["lifestyle", userId, "goals"] as const,
    goals: (userId: string, filters: QueryFilters = {}) => ["lifestyle", userId, "goals", normalizeQueryInput(filters)] as const,
    goal: (userId: string, goalId: string) => ["lifestyle", userId, "goal", goalId] as const,
    habitsRoot: (userId: string) => ["lifestyle", userId, "habits"] as const,
    habits: (userId: string, filters: QueryFilters = {}) => ["lifestyle", userId, "habits", normalizeQueryInput(filters)] as const,
    habit: (userId: string, habitId: string) => ["lifestyle", userId, "habit", habitId] as const,
    habitSummary: (userId: string) => ["lifestyle", userId, "habit-summary"] as const,
    calendarRoot: (userId: string) => ["lifestyle", userId, "calendar"] as const,
    calendar: (userId: string, range: CalendarRange) => ["lifestyle", userId, "calendar", normalizeQueryInput(range)] as const,
    calendarConflicts: (userId: string, range: CalendarRange) => ["lifestyle", userId, "calendar-conflicts", normalizeQueryInput(range)] as const,
    unscheduledTasks: (userId: string) => ["lifestyle", userId, "unscheduled-tasks"] as const,
    availability: (userId: string) => ["lifestyle", userId, "availability"] as const,
    preferences: (userId: string) => ["lifestyle", userId, "preferences"] as const,
  },
  work: {
    root: (userId: string) => ["work", userId] as const,
    organizations: (userId: string) => ["work", userId, "organizations"] as const,
    organizationRoot: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId] as const,
    organization: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId, "overview"] as const,
    members: (organizationId: string, userId: string, filters: QueryFilters = {}) => ["work", userId, "organization", organizationId, "members", normalizeQueryInput(filters)] as const,
    invitations: (organizationId: string, userId: string, filters: QueryFilters = {}) => ["work", userId, "organization", organizationId, "invitations", normalizeQueryInput(filters)] as const,
    teamsRoot: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId, "teams"] as const,
    teamDetailsRoot: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId, "team"] as const,
    teams: (organizationId: string, userId: string, filters: QueryFilters = {}) => ["work", userId, "organization", organizationId, "teams", normalizeQueryInput(filters)] as const,
    team: (organizationId: string, userId: string, teamId: string) => ["work", userId, "organization", organizationId, "team", teamId] as const,
    teamCapacity: (organizationId: string, userId: string, teamId: string) => ["work", userId, "organization", organizationId, "team", teamId, "capacity"] as const,
    projectsRoot: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId, "projects"] as const,
    projects: (organizationId: string, userId: string, filters: QueryFilters = {}) => ["work", userId, "organization", organizationId, "projects", normalizeQueryInput(filters)] as const,
    project: (organizationId: string, userId: string, projectId: string) => ["work", userId, "organization", organizationId, "project", projectId] as const,
    tasksRoot: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId, "tasks"] as const,
    tasks: (organizationId: string, userId: string, filters: QueryFilters = {}) => ["work", userId, "organization", organizationId, "tasks", normalizeQueryInput(filters)] as const,
    task: (organizationId: string, userId: string, taskId: string) => ["work", userId, "organization", organizationId, "task", taskId] as const,
    capacityRoot: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId, "capacity"] as const,
    capacity: (organizationId: string, userId: string, filters: QueryFilters = {}) => ["work", userId, "organization", organizationId, "capacity", normalizeQueryInput(filters)] as const,
    memberRoot: (organizationId: string, userId: string) => ["work", userId, "organization", organizationId, "member"] as const,
    memberAvailability: (organizationId: string, userId: string, memberId: string) => ["work", userId, "organization", organizationId, "member", memberId, "availability"] as const,
    memberWorkload: (organizationId: string, userId: string, memberId: string, filters: QueryFilters = {}) => ["work", userId, "organization", organizationId, "member", memberId, "workload", normalizeQueryInput(filters)] as const,
  },
} as const;
