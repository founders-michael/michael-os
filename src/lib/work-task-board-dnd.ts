export const workTaskBoardStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"] as const;
export type WorkTaskBoardStatus = typeof workTaskBoardStatuses[number];
export const workTaskBoardDropId = (status: WorkTaskBoardStatus) => `work-task-status:${status}`;

export function statusFromWorkTaskDropId(id: string | number | undefined): WorkTaskBoardStatus | null {
  if (typeof id !== "string" || !id.startsWith("work-task-status:")) return null;
  const status = id.slice("work-task-status:".length);
  return workTaskBoardStatuses.includes(status as WorkTaskBoardStatus) ? status as WorkTaskBoardStatus : null;
}

export function getWorkTaskDrop(status: WorkTaskBoardStatus, canceled: boolean) {
  return canceled ? null : status;
}
