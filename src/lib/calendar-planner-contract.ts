/**
 * Language-independent input/output contract for a future planning service.
 * The current app does not call an optimizer and proposals are never persisted
 * by this boundary; the application must review and explicitly apply them.
 */
export type PlannerConstraintInput = {
  user: { timeZone: string };
  horizon: { from: string; to: string };
  scheduledActivities: Array<{ id: string; eventType: "TASK_SESSION" | "COMMITMENT"; schedulingMode: "FIXED" | "FLEXIBLE"; taskId: string | null; title: string; startAt: string; endAt: string; timeZone: string }>;
  flexibleTasks: Array<{ id: string; title: string; durationMinutes: number; dueDate: string | null; priority: "LOW" | "MEDIUM" | "HIGH"; earliestStart?: string | null }>;
  recurringAvailability: Array<{ id: string; isoWeekday: number; startLocalTime: string; endLocalTime: string; timeZone: string }>;
  unavailableIntervals: Array<{ id: string; startAt: string; endAt: string; timeZone: string }>;
  constraints: { preserveFixedEvents: true; noOverlaps: true; dueDatesAreDeadlinesOnly: true };
  preferences?: { granularityMinutes: 15; minimumBreakMinutes?: number; preferredSessionMinutes?: number; allowTaskSplitting?: boolean; minimumSplitSessionMinutes?: number };
};

export type PlannerProposal = {
  requestId: string;
  horizon: { from: string; to: string };
  timeZone: string;
  solverStatus: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIMEOUT" | "ERROR";
  planningDurationMs: number;
  generatedAt: string;
  proposedActivities: Array<{ existingEventId: string | null; taskId: string; startAt: string; endAt: string; timeZone: string; durationMinutes: number; sessionIndex: number; sessionCount: number }>;
  explanations: Array<{ taskId: string | null; message: string; code: string }>;
  unscheduledTasks: Array<{ taskId: string; reasonCode: string; reason: string }>;
  conflicts: Array<{ existingEventId: string; otherEventId: string; proposedTaskId: string | null; startAt: string; endAt: string; eventType: string }>;
  warnings: Array<{ code: string; message: string }>;
  summary: { tasksRequested: number; tasksScheduled: number; tasksUnscheduled: number; minutesScheduled: number; minutesAvailable: number; minutesRequired: number };
};

/** Next.js review envelope; approvalToken is short-lived and never sent to browser-visible planner APIs. */
export type PlannerReviewProposal = Omit<PlannerProposal, "proposedActivities"> & {
  proposedActivities: Array<PlannerProposal["proposedActivities"][number] & { selectionId: string }>;
  approvalToken: string;
  approvalExpiresAt: string;
  omittedTaskCount: number;
  taskDetails: Array<{ id: string; title: string; priority: "LOW" | "MEDIUM" | "HIGH"; dueDate: string | null; durationMinutes: number }>;
};
