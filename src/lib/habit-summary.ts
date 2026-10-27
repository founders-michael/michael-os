export type HabitSummaryCounts = { active: number; scheduledToday: number; completedToday: number };

export function adjustHabitCompletion(summary: HabitSummaryCounts, wasCompleted: boolean, scheduledToday: boolean): HabitSummaryCounts {
  if (!scheduledToday) return summary;
  const difference = wasCompleted ? -1 : 1;
  return { ...summary, completedToday: Math.max(0, Math.min(summary.scheduledToday, summary.completedToday + difference)) };
}
