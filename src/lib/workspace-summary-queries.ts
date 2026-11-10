"use client";

import { apiQueryOptions } from "@/lib/api-query";
import { getApiJson } from "@/lib/api-query";
import { queryKeys } from "@/lib/query-keys";
import { queryStaleTimes } from "@/lib/query-client";
import { queryOptions } from "@tanstack/react-query";
import type { TaskSummary } from "@/components/task-manager";

export type HabitSummary = { active: number; scheduledToday: number; completedToday: number };
export type HabitDashboard = { habits: import("@/lib/habit-service").HabitDto[]; summary: HabitSummary };

export function taskSummaryQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.lifestyle.taskSummary(userId),
    queryFn: async ({ signal }) => (await getApiJson<{ summary: TaskSummary }>("/api/tasks/summary", signal)).summary,
    staleTime: queryStaleTimes.taskSummary,
  });
}

export function habitSummaryQuery(userId: string) {
  return apiQueryOptions<HabitDashboard>({
    queryKey: queryKeys.lifestyle.habitSummary(userId),
    path: "/api/habits/summary",
    staleTime: queryStaleTimes.habitSummary,
  });
}
