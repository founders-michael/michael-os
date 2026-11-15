/**
 * The shape of `get_daily_overview`: the user's whole day as items, not counts.
 *
 * Michael is forbidden from converting units or re-deriving figures (see the
 * system instruction in agent.ts), so every time here is pre-formatted on the
 * user's own clock. Without that, a UTC `startAt` is either repeated in UTC or
 * converted by the model — and a model-converted time is a fabricated one.
 *
 * Pure: the tool in tools.ts loads the data and passes it in.
 */

type Priority = "LOW" | "MEDIUM" | "HIGH";
type Status = "TODO" | "IN_PROGRESS" | "COMPLETED";

export type OverviewTask = { id: string; title: string; priority: Priority; status: Status; dueDate: string | null; remainingDurationMinutes: number | null };
export type OverviewSession = { startAt: string; endAt: string };
/** A task with its planned sessions, as `classifyTasks` returns it. */
export type OverviewTaskEntry = { task: OverviewTask; sessions: OverviewSession[] };
export type OverviewEvent = { title: string; eventType: string; startAt: string; endAt: string; taskTitle: string | null };
export type OverviewGoal = { title: string; progress: number; targetDate: string | null; milestones: { title: string; status: string }[] };
export type OverviewHabit = { title: string; frequency: string; todayScheduled: boolean; completedToday: boolean; currentStreak: number; bestStreak: number; startTime?: string | null; endTime?: string | null };
export type OverviewProfile = { wakeUpTime: string; bedtime: string; workStartTime: string | null; workEndTime: string | null; workDays: string[]; focusSessionMinutes: number; breakDurationMinutes: number };

import { habitTimeLabel } from "@/lib/calendar-habits";
import { localMinuteOfDay } from "@/lib/calendar-day-layout";

/** Items per list. Enough to describe a day; bounded so one tool result stays small. */
export const OVERVIEW_LIST_LIMIT = 10;

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const STATUS_LABEL: Record<Status, string> = { TODO: "to do", IN_PROGRESS: "in progress", COMPLETED: "completed" };
const EVENT_KIND: Record<string, string> = { TASK_SESSION: "task session", COMMITMENT: "commitment", UNAVAILABLE: "unavailable time" };

/** "9:05 AM" on the user's clock. */
export function localClock(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "9:00 AM – 10:30 AM" on the user's clock. */
export function localTimeRange(startAt: string, endAt: string, timeZone: string) {
  return `${localClock(startAt, timeZone)} – ${localClock(endAt, timeZone)}`;
}

/** "07:00" (stored as HH:mm local) → "7:00 AM". */
export function wallClock(hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return hhmm;
  const suffix = hours! < 12 ? "AM" : "PM";
  return `${((hours! + 11) % 12) + 1}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function weekdayOf(localDate: string) {
  return WEEKDAYS[new Date(`${localDate}T12:00:00Z`).getUTCDay()]!;
}

function localDateOf(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function taskItem({ task, sessions }: OverviewTaskEntry, localDate: string, timeZone: string) {
  const planned = sessions.filter((session) => localDateOf(session.startAt, timeZone) === localDate).map((session) => localTimeRange(session.startAt, session.endAt, timeZone));
  return {
    title: task.title,
    priority: task.priority,
    status: STATUS_LABEL[task.status],
    dueDate: task.dueDate,
    remainingMinutes: task.remainingDurationMinutes,
    scheduledTimesToday: planned.length ? planned : "no time scheduled today",
  };
}

export function buildDailyOverview(input: {
  localDate: string;
  timeZone: string;
  profile: OverviewProfile;
  counts: { tasks: unknown; goals: unknown; habits: unknown };
  tasks: { today: OverviewTaskEntry[]; overdue: OverviewTaskEntry[]; upcoming: OverviewTaskEntry[]; unscheduled: OverviewTaskEntry[]; completedToday: { title: string; completedAt: string | null }[] };
  events: OverviewEvent[];
  goals: OverviewGoal[];
  habits: OverviewHabit[];
}) {
  const { localDate, timeZone, profile } = input;
  const weekday = weekdayOf(localDate);
  // Calendar events and today's timed habits, in the order they happen.
  const timedHabits = input.habits.filter((habit) => habit.todayScheduled && habit.startTime);
  const scheduleItems = [
    ...input.events.map((event) => ({ minute: localMinuteOfDay(event.startAt, timeZone), entry: { time: localTimeRange(event.startAt, event.endAt, timeZone), title: event.taskTitle ?? event.title, kind: EVENT_KIND[event.eventType] ?? event.eventType.toLowerCase() } })),
    ...timedHabits.map((habit) => ({ minute: Number(habit.startTime!.slice(0, 2)) * 60 + Number(habit.startTime!.slice(3)), entry: { time: habitTimeLabel(habit.startTime!, habit.endTime ?? null), title: habit.title, kind: habit.completedToday ? "habit (done today)" : "habit" } })),
  ].sort((left, right) => left.minute - right.minute);
  const list = <T,>(items: T[]) => items.slice(0, OVERVIEW_LIST_LIMIT);
  const sessionsFor = (rows: OverviewTaskEntry[]) => rows.map((entry) => taskItem(entry, localDate, timeZone));

  return {
    localDate,
    weekday,
    timeZone,
    routine: {
      wakeUp: wallClock(profile.wakeUpTime),
      bedtime: wallClock(profile.bedtime),
      workDay: profile.workDays.includes(weekday),
      workHours: profile.workStartTime && profile.workEndTime ? `${wallClock(profile.workStartTime)} – ${wallClock(profile.workEndTime)}` : "not set",
      focusSessionMinutes: profile.focusSessionMinutes,
      breakMinutes: profile.breakDurationMinutes,
    },
    schedule: scheduleItems.length ? list(scheduleItems).map((item) => item.entry) : "nothing on the calendar today",
    tasks: {
      dueOrPlannedToday: sessionsFor(list(input.tasks.today)),
      overdue: sessionsFor(list(input.tasks.overdue)),
      completedToday: list(input.tasks.completedToday).map((task) => ({ title: task.title, completedAt: task.completedAt ? localClock(task.completedAt, timeZone) : "today" })),
      comingUp: sessionsFor(list(input.tasks.upcoming)),
      unscheduled: sessionsFor(list(input.tasks.unscheduled)),
    },
    goals: list(input.goals).map((goal) => ({
      title: goal.title,
      progressPercent: goal.progress,
      targetDate: goal.targetDate ?? "no target date",
      milestones: `${goal.milestones.filter((milestone) => milestone.status === "COMPLETED").length} of ${goal.milestones.length} done`,
      nextMilestone: goal.milestones.find((milestone) => milestone.status !== "COMPLETED")?.title ?? "none",
    })),
    habits: {
      today: list(input.habits.filter((habit) => habit.todayScheduled)).map((habit) => ({ title: habit.title, time: habit.startTime ? habitTimeLabel(habit.startTime, habit.endTime ?? null) : "any time", doneToday: habit.completedToday, currentStreakDays: habit.currentStreak, bestStreakDays: habit.bestStreak })),
      notScheduledToday: list(input.habits.filter((habit) => !habit.todayScheduled)).map((habit) => habit.title),
    },
    counts: input.counts,
  };
}
