/**
 * Language-independent input/output contract for a future planning service.
 * The current app does not call an optimizer and proposals are never persisted
 * by this boundary; the application must review and explicitly apply them.
 */
export type PlannerConstraintInput = {
  user: { timeZone: string };
  horizon: { from: string; to: string };
  scheduledActivities: Array<{ id: string; eventType: "TASK_SESSION" | "COMMITMENT"; schedulingMode: "FIXED" | "FLEXIBLE"; taskId: string | null; title: string; startAt: string; endAt: string; timeZone: string }>;
  flexibleTasks: Array<{ id: string; title: string; durationMinutes: number; dueDate: string | null; priority: "LOW" | "MEDIUM" | "HIGH" }>;
  recurringAvailability: Array<{ id: string; isoWeekday: number; startLocalTime: string; endLocalTime: string; timeZone: string }>;
  unavailableIntervals: Array<{ id: string; startAt: string; endAt: string; timeZone: string }>;
  constraints: { preserveFixedEvents: true; noOverlaps: true; dueDatesAreDeadlinesOnly: true };
};

export type PlannerProposal = {
  proposedActivities: Array<{ existingEventId: string | null; taskId: string; startAt: string; endAt: string; timeZone: string }>;
  explanations: Array<{ taskId: string | null; message: string; code: string }>;
  unscheduledTasks: Array<{ taskId: string; reason: string }>;
  conflicts: Array<{ existingEventId: string; proposedTaskId: string | null; startAt: string; endAt: string; eventType: string }>;
};
