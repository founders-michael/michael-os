import type { CalendarEventDto } from "@/lib/calendar-service";
import type { TaskDto } from "@/lib/task-service";
import type { TaskSections } from "@/lib/task-classification";

export type MyDayTimelineKind = "focus" | "commitment" | "unavailable";
export type DailyTaskStatus = TaskDto["status"];

export type DailyTaskEntry = {
  task: TaskDto;
  statusAtSelectedDate: DailyTaskStatus | null;
  completionAtSelectedDate: string | null;
  activityAtSelectedDate: string | null;
  plannedSessions: Array<{ id: string; startAt: string; endAt: string; timeZone: string }>;
};

export type DailyTaskSummary = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  unclassified: number;
  completionPercent: number;
};

export function summarizeDailyTasks(entries: DailyTaskEntry[]): DailyTaskSummary {
  const tasks = [...new Map(entries.map((entry) => [entry.task.id, entry])).values()];
  const completed = tasks.filter((entry) => entry.statusAtSelectedDate === "COMPLETED").length;
  const inProgress = tasks.filter((entry) => entry.statusAtSelectedDate === "IN_PROGRESS").length;
  const pending = tasks.filter((entry) => entry.statusAtSelectedDate === "TODO").length;
  return {
    total: tasks.length,
    completed,
    inProgress,
    pending,
    unclassified: tasks.length - completed - inProgress - pending,
    completionPercent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
}

export function statusAtDate(input: {
  currentStatus: DailyTaskStatus;
  selectedDate: string;
  today: string;
  dayEnd: string;
  histories: Array<{ previousStatus: DailyTaskStatus | null; status: DailyTaskStatus; changedAt: string }>;
}): DailyTaskStatus | null {
  const end = Date.parse(input.dayEnd);
  const ordered = [...input.histories].sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));
  const priorOrSameDay = ordered.filter((history) => Date.parse(history.changedAt) < end);
  const latest = priorOrSameDay.at(-1);
  if (latest) return latest.status;
  const next = ordered.find((history) => Date.parse(history.changedAt) > end);
  if (next?.previousStatus) return next.previousStatus;
  if (input.selectedDate === input.today) return input.currentStatus;
  return null;
}

export type MyDayTimelineItem = {
  id: string;
  kind: MyDayTimelineKind;
  label: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  timeZone: string;
  taskId: string | null;
  taskTitle: string | null;
};

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

export function greetingForTimeZone(timeZone: string, now: Date) {
  const hourText = new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  const hour = Number(hourText);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function formatLocalDate(date: string) {
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .format(new Date(`${date}T12:00:00.000Z`));
}

export function buildMyDayTimeline(events: CalendarEventDto[]): MyDayTimelineItem[] {
  return events.map((event): MyDayTimelineItem => ({
    id: event.id,
    kind: event.eventType === "TASK_SESSION" ? "focus" : event.eventType === "UNAVAILABLE" ? "unavailable" : "commitment",
    label: event.eventType === "TASK_SESSION"
      ? event.schedulingMode === "FLEXIBLE" ? "Focus session" : "Task session"
      : event.eventType === "UNAVAILABLE" ? "Unavailable" : "Commitment",
    title: event.taskTitle || event.title,
    description: event.description,
    startAt: event.startAt,
    endAt: event.endAt,
    timeZone: event.timeZone,
    taskId: event.taskId,
    taskTitle: event.taskTitle,
  })).sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt) || Date.parse(left.endAt) - Date.parse(right.endAt));
}

export function unscheduledMyDayTasks(sections: TaskSections<TaskDto>, events: CalendarEventDto[]) {
  const scheduledTaskIds = new Set(events.flatMap((event) => event.taskId ? [event.taskId] : []));
  for (const items of Object.values(sections)) {
    for (const item of items) {
      if (item.sessions.length) scheduledTaskIds.add(item.task.id);
    }
  }
  const candidates = [...sections.today, ...sections.overdue, ...sections.backlog]
    .filter(({ task, sessions }) => task.status !== "COMPLETED" && sessions.length === 0 && !scheduledTaskIds.has(task.id));
  return [...new Map(candidates.map(({ task }) => [task.id, task])).values()].slice(0, 6);
}

export function priorityMyDayTasks(sections: TaskSections<TaskDto>) {
  return [...sections.overdue, ...sections.today]
    .filter(({ task }) => task.status !== "COMPLETED")
    .slice(0, 4)
    .map(({ task }) => task);
}

export function briefingCopy(input: {
  overdue: number;
  dueToday: number;
  commitments: number;
  scheduledHabits: number;
  completedHabits: number;
}) {
  if (input.overdue > 0) return `${input.overdue} overdue ${input.overdue === 1 ? "task needs" : "tasks need"} a decision${input.dueToday ? `, and ${input.dueToday} ${input.dueToday === 1 ? "task is" : "tasks are"} due today` : ""}. Review what still matters, then make room for the next step.`;
  if (input.dueToday > 0) return `${input.dueToday} ${input.dueToday === 1 ? "task is" : "tasks are"} due today${input.commitments ? ` alongside ${input.commitments} scheduled ${input.commitments === 1 ? "commitment" : "commitments"}` : ""}. Your day is ready for a steady start.`;
  if (input.commitments > 0) return `Your task list has no items due today, and ${input.commitments} ${input.commitments === 1 ? "commitment is" : "commitments are"} on the calendar. Take a moment to choose what matters around them.`;
  if (input.scheduledHabits > 0 && input.completedHabits < input.scheduledHabits) return `Your calendar is open. ${input.completedHabits} of ${input.scheduledHabits} scheduled habits are complete; begin with one small action.`;
  return "Your schedule is open. Choose one meaningful next step, then let the rest of the day take shape.";
}
