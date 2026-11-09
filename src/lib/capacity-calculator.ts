import { isoWeekday, localDateTimeToIso, localDayStartIso, shiftLocalDate } from "@/lib/calendar-date";

export type CapacitySchedule = {
  workingDays: number[];
  dailyStartTime: string;
  dailyEndTime: string;
  timeZone: string;
  weeklyCapacityMinutes: number;
};

export type CapacityException = {
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  timeZone: string;
};

export type CapacityDay = { date: string; minutes: number };
export type CapacityPolicyDefaults = {
  capacityWorkingDays: number[];
  capacityDailyStartTime: string;
  capacityDailyEndTime: string;
  capacityTimeZone: string;
  capacityWeeklyMinutes: number;
};
export type CapacityOverride = {
  workingDays: number[];
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  timeZone: string | null;
  weeklyCapacityMinutes: number | null;
};
const intervalCache = new Map<string, [number, number] | null>();

/** Organization defaults -> team overrides -> member reductions. */
export function resolveCapacitySchedule(policy: CapacityPolicyDefaults, team: CapacityOverride | null, member: CapacityOverride | null): { schedule: CapacitySchedule; source: "ORGANIZATION" | "TEAM" | "MEMBER" } {
  const teamDays = team?.workingDays.length ? team.workingDays : null;
  const memberDays = member?.workingDays.length ? member.workingDays : null;
  const memberConfigured = Boolean(member && (memberDays || member.dailyStartTime || member.dailyEndTime || member.timeZone || member.weeklyCapacityMinutes !== null));
  const teamConfigured = Boolean(team && (teamDays || team.dailyStartTime || team.dailyEndTime || team.timeZone || team.weeklyCapacityMinutes !== null));
  const baseDays = teamDays ?? policy.capacityWorkingDays;
  const baseStart = team?.dailyStartTime ?? policy.capacityDailyStartTime;
  const baseEnd = team?.dailyEndTime ?? policy.capacityDailyEndTime;
  const baseWeekly = team?.weeklyCapacityMinutes ?? policy.capacityWeeklyMinutes;
  return {
    schedule: {
      workingDays: memberDays ? baseDays.filter((day) => memberDays.includes(day)) : baseDays,
      dailyStartTime: member?.dailyStartTime ? (member.dailyStartTime > baseStart ? member.dailyStartTime : baseStart) : baseStart,
      dailyEndTime: member?.dailyEndTime ? (member.dailyEndTime < baseEnd ? member.dailyEndTime : baseEnd) : baseEnd,
      timeZone: member?.timeZone ?? team?.timeZone ?? policy.capacityTimeZone,
      weeklyCapacityMinutes: member?.weeklyCapacityMinutes !== null && member?.weeklyCapacityMinutes !== undefined ? Math.min(member.weeklyCapacityMinutes, baseWeekly) : baseWeekly,
    },
    source: memberConfigured ? "MEMBER" : teamConfigured ? "TEAM" : "ORGANIZATION",
  };
}

function validRange(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    throw new RangeError("Capacity date range is invalid.");
  }
  for (const date of [from, to]) {
    try {
      if (new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) throw new Error();
    } catch {
      throw new RangeError("Capacity date range is invalid.");
    }
  }
  let day = from;
  let count = 0;
  while (day < to && count <= 93) { day = shiftLocalDate(day, 1); count++; }
  if (count < 1) throw new RangeError("Capacity date range must include at least one day.");
  if (count > 93) throw new RangeError("Capacity ranges cannot exceed 93 days.");
  return count;
}

function shiftInterval(date: string, schedule: CapacitySchedule): [number, number] | null {
  const dayEnabled = schedule.workingDays.includes(isoWeekday(date));
  const key = `${date}|${schedule.timeZone}|${schedule.dailyStartTime}|${schedule.dailyEndTime}|${dayEnabled}`;
  if (intervalCache.has(key)) return intervalCache.get(key) ?? null;
  if (!dayEnabled) { intervalCache.set(key, null); return null; }
  try {
    const start = Date.parse(localDateTimeToIso(date, schedule.dailyStartTime, schedule.timeZone));
    const end = Date.parse(localDateTimeToIso(date, schedule.dailyEndTime, schedule.timeZone));
    const result = end > start ? [start, end] as [number, number] : null;
    intervalCache.set(key, result);
    if (intervalCache.size > 10_000) intervalCache.delete(intervalCache.keys().next().value!);
    return result;
  } catch {
    // Invalid/nonexistent local shift boundaries contribute no capacity.
    intervalCache.set(key, null);
    return null;
  }
}

function exceptionInterval(exception: CapacityException): [number, number] {
  if (exception.startTime && exception.endTime) {
    return [
      Date.parse(localDateTimeToIso(exception.startDate, exception.startTime, exception.timeZone)),
      Date.parse(localDateTimeToIso(exception.endDate, exception.endTime, exception.timeZone)),
    ];
  }
  return [
    Date.parse(localDayStartIso(exception.startDate, exception.timeZone)),
    Date.parse(localDayStartIso(shiftLocalDate(exception.endDate, 1), exception.timeZone)),
  ];
}

function overlapMinutes(left: [number, number], right: [number, number]) {
  return Math.max(0, Math.min(left[1], right[1]) - Math.max(left[0], right[0])) / 60_000;
}

/**
 * Calculates nominal member capacity for local calendar dates, in half-open
 * range [from, to). Shift boundaries use the calendar-date helper policy:
 * repeated wall times resolve to the earlier instant; nonexistent boundaries
 * yield zero capacity for that day. Weekly caps scale scheduled minutes, and
 * local-date exceptions subtract only their actual overlap with a shift.
 */
export function calculateCapacityDays(from: string, to: string, schedule: CapacitySchedule, exceptions: CapacityException[] = []): CapacityDay[] {
  const count = validRange(from, to);
  if (!Number.isInteger(schedule.weeklyCapacityMinutes) || schedule.weeklyCapacityMinutes < 0) throw new RangeError("Weekly capacity must be a non-negative integer.");
  new Intl.DateTimeFormat("en", { timeZone: schedule.timeZone });

  const selectedDates = Array.from({ length: count }, (_, index) => shiftLocalDate(from, index));
  const selectedSet = new Set(selectedDates);
  const weekDates = new Map<string, string[]>();
  for (const date of selectedDates) {
    const weekStart = shiftLocalDate(date, 1 - isoWeekday(date));
    if (!weekDates.has(weekStart)) weekDates.set(weekStart, Array.from({ length: 7 }, (_, index) => shiftLocalDate(weekStart, index)));
  }

  const weeklyFactors = new Map<string, number>();
  for (const [weekStart, dates] of weekDates) {
    const scheduledMinutes = dates.reduce((total, date) => {
      const interval = shiftInterval(date, schedule);
      return total + (interval ? overlapMinutes(interval, interval) : 0);
    }, 0);
    weeklyFactors.set(weekStart, scheduledMinutes > 0 ? Math.min(1, schedule.weeklyCapacityMinutes / scheduledMinutes) : 0);
  }

  const absoluteExceptions = exceptions.map((exception) => exceptionInterval(exception));
  return selectedDates.map((date) => {
    const interval = shiftInterval(date, schedule);
    if (!interval) return { date, minutes: 0 };
    const weekStart = shiftLocalDate(date, 1 - isoWeekday(date));
    const factor = weeklyFactors.get(weekStart) ?? 0;
    const unavailable = absoluteExceptions.reduce((total, exception) => total + overlapMinutes(interval, exception), 0);
    const scheduled = overlapMinutes(interval, interval);
    return { date, minutes: Math.max(0, Math.round((scheduled - unavailable) * factor)) };
  }).filter(({ date }) => selectedSet.has(date));
}

export function summarizeCapacityDays(days: CapacityDay[]) {
  return days.reduce((total, day) => total + day.minutes, 0);
}

export type WorkloadTask = {
  id: string;
  dueDate: string | null;
  estimatedMinutes: number | null;
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
  archivedAt: string | null;
  assigneeUserIds: string[];
};

export type MemberWorkload = { assignedMinutes: number; unestimatedTaskCount: number; undatedTaskCount: number };

/** Estimates the new assignee's share before a multi-assignee task is saved. */
export function projectedAssigneeMinutes(currentAssignedMinutes: number, taskEstimatedMinutes: number, currentAssigneeCount: number) {
  if (![currentAssignedMinutes, taskEstimatedMinutes, currentAssigneeCount].every(Number.isInteger) || currentAssignedMinutes < 0 || taskEstimatedMinutes < 0 || currentAssigneeCount < 0) {
    throw new RangeError("Assignment capacity inputs must be non-negative integers.");
  }
  return currentAssignedMinutes + Math.ceil(taskEstimatedMinutes / (currentAssigneeCount + 1));
}

/** Assigns each active task estimate once, split evenly across stable user IDs. */
export function calculateAssignedWorkload(tasks: WorkloadTask[], memberIds: string[], from: string, to: string): Map<string, MemberWorkload> {
  validRange(from, to);
  const visible = new Set(memberIds);
  const result = new Map(memberIds.map((id) => [id, { assignedMinutes: 0, unestimatedTaskCount: 0, undatedTaskCount: 0 }]));
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    if (task.status === "DONE" || task.archivedAt || task.assigneeUserIds.length === 0) continue;
    const assignees = [...new Set(task.assigneeUserIds)].sort();
    if (task.dueDate === null) {
      for (const id of assignees) if (visible.has(id)) result.get(id)!.undatedTaskCount++;
      continue;
    }
    if (task.dueDate < from || task.dueDate >= to) continue;
    if (task.estimatedMinutes === null) {
      for (const id of assignees) if (visible.has(id)) result.get(id)!.unestimatedTaskCount++;
      continue;
    }
    const base = Math.floor(task.estimatedMinutes / assignees.length);
    const remainder = task.estimatedMinutes % assignees.length;
    assignees.forEach((id, index) => {
      if (visible.has(id)) result.get(id)!.assignedMinutes += base + (index < remainder ? 1 : 0);
    });
  }
  return result;
}

export type CapacityStatus = "UNDERUTILIZED" | "HEALTHY" | "NEAR_CAPACITY" | "OVER_CAPACITY" | "UNCONFIGURED";

export function capacityStatus(availableMinutes: number, assignedMinutes: number, underPercent: number, nearPercent: number, overPercent: number): { utilizationPercent: number | null; status: CapacityStatus; remainingMinutes: number } {
  if (availableMinutes <= 0) return { utilizationPercent: null, status: assignedMinutes > 0 ? "OVER_CAPACITY" : "UNCONFIGURED", remainingMinutes: -assignedMinutes };
  const utilizationPercent = Math.round((assignedMinutes / availableMinutes) * 100);
  const status = utilizationPercent >= overPercent ? "OVER_CAPACITY" : utilizationPercent >= nearPercent ? "NEAR_CAPACITY" : utilizationPercent < underPercent ? "UNDERUTILIZED" : "HEALTHY";
  return { utilizationPercent, status, remainingMinutes: availableMinutes - assignedMinutes };
}
