"use client";

import { queryKeys } from "@/lib/query-keys";
import { queryStaleTimes } from "@/lib/query-client";
import type { TaskSummary } from "@/components/task-manager";

export type HabitSummary = { active: number; scheduledToday: number; completedToday: number };
export type HabitDashboard = { habits: import("@/lib/habit-service").HabitDto[]; summary: HabitSummary };

class WorkspaceQueryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new WorkspaceQueryError(data.error || "Workspace data could not be loaded.", response.status);
  return data;
}

export function taskSummaryQuery(userId: string) {
  return {
    queryKey: queryKeys.lifestyle.taskSummary(userId),
    queryFn: () => getJson<{ summary: TaskSummary }>("/api/tasks/summary").then((data) => data.summary),
    staleTime: queryStaleTimes.taskLists,
  };
}

export function habitSummaryQuery(userId: string) {
  return {
    queryKey: queryKeys.lifestyle.habitSummary(userId),
    queryFn: () => getJson<HabitDashboard>("/api/habits/summary"),
    staleTime: queryStaleTimes.taskLists,
  };
}
