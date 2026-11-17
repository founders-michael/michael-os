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

/** The hour (0–23) on the user's own clock — never the server's. */
export function localHour(timeZone: string, now: Date) {
  const hourText = new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  return Number(hourText);
}

export function greetingForTimeZone(timeZone: string, now: Date) {
  const hour = localHour(timeZone, now);
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

export type HomeAskPrompt = { label: string; href: string };

/** Hour from which Home offers to review the day. */
export const REVIEW_PROMPT_HOUR = 17;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const askHref = (prompt: string) => `/assistant?prompt=${encodeURIComponent(prompt)}`;

/**
 * The question an ask link carries, for a client that opens the assistant
 * itself instead of following a web path. Null for any other link, such as the
 * Daily Review entry, which has no question to prefill.
 */
export function promptFromAskHref(href: string): string | null {
  const query = href.startsWith("/assistant?") ? href.slice("/assistant?".length) : null;
  return query === null ? null : new URLSearchParams(query).get("prompt");
}

/**
 * Up to three things to ask Michael about the day, chosen from the user's
 * actual counts. Each one only opens the assistant with the question filled
 * in; the user still reads it and presses Send. A tap on Home must not spend a
 * model turn — or send personal data — that the user did not explicitly ask
 * for, and the assistant's own consent gate has to see every message first.
 *
 * The evening review uses the assistant's existing Daily Review entry
 * (`?reviewDate=`), which asks for the structured review the tool supports.
 */
export function homeAskPrompts(input: {
  overdue: number;
  dueToday: number;
  scheduledHabits: number;
  completedHabits: number;
  localHour: number;
  today: string;
}): HomeAskPrompt[] {
  const prompts: HomeAskPrompt[] = [];
  if (input.overdue > 0) {
    prompts.push({ label: `Decide on ${plural(input.overdue, "overdue task")}`, href: askHref(`Help me decide what to do with my ${plural(input.overdue, "overdue task")}.`) });
  }
  if (input.dueToday > 0) {
    prompts.push({ label: `Plan around ${plural(input.dueToday, "task")} due today`, href: askHref(`Help me plan my day around the ${plural(input.dueToday, "task")} due today.`) });
  }
  const remainingHabits = Math.max(0, input.scheduledHabits - input.completedHabits);
  if (remainingHabits > 0) {
    prompts.push({ label: `Fit in ${plural(remainingHabits, "remaining habit")}`, href: askHref(`I still have ${plural(remainingHabits, "habit")} to do today. When could I fit ${remainingHabits === 1 ? "it" : "them"} in?`) });
  }
  if (input.localHour >= REVIEW_PROMPT_HOUR) {
    prompts.push({ label: "Review how today went", href: `/assistant?reviewDate=${encodeURIComponent(input.today)}` });
  }
  if (prompts.length < 3) prompts.push({ label: "What should I focus on?", href: askHref("What should I focus on today?") });
  return prompts.slice(0, 3);
}

/** One observation on Home, with the question it would ask Michael. */
export type MichaelNotice = {
  id: string;
  tone: "warn" | "ai";
  tag: string;
  text: string;
  action: HomeAskPrompt;
};

const NOTICE_LIMIT = 2;

/**
 * "Michael noticed": short observations computed from saved data by fixed
 * rules — never generated by a model, so opening Home spends no model turn.
 * Each one's action only opens the assistant with a question filled in.
 *
 * Order is most actionable first: overdue tasks, then a goal whose target
 * date has passed, then a habit streak a check-in today would extend.
 */
export function michaelNotices(input: {
  overdue: number;
  goals: Array<{ title: string; status: string; targetDate: string | null; milestoneCount: number; completedMilestoneCount: number }>;
  habits: Array<{ title: string; status: string; todayScheduled: boolean; completedToday: boolean; currentStreak: number; bestStreak: number }>;
  today: string;
}): MichaelNotice[] {
  const notices: MichaelNotice[] = [];
  if (input.overdue > 0) {
    notices.push({
      id: "overdue", tone: "warn", tag: input.overdue === 1 ? "Overdue task" : "Overdue tasks",
      text: `${plural(input.overdue, "task")} ${input.overdue === 1 ? "is" : "are"} past ${input.overdue === 1 ? "its" : "their"} due date.`,
      action: { label: "Decide what to do", href: askHref(`Help me decide what to do with my ${plural(input.overdue, "overdue task")}.`) },
    });
  }
  const lapsed = input.goals
    .filter((goal) => goal.status === "ACTIVE" && goal.targetDate !== null && goal.targetDate < input.today)
    .sort((a, b) => (a.targetDate! < b.targetDate! ? -1 : 1))[0];
  if (lapsed) {
    const milestones = lapsed.milestoneCount ? ` with ${lapsed.completedMilestoneCount} of ${plural(lapsed.milestoneCount, "milestone")} done` : "";
    notices.push({
      id: "goal-target", tone: "warn", tag: "Goal target passed",
      text: `“${lapsed.title}” passed its ${formatShortDate(lapsed.targetDate!)} target${milestones}.`,
      action: { label: "Suggest a new date", href: askHref(`My goal “${lapsed.title}” passed its target date. Suggest a realistic new target date.`) },
    });
  }
  const streak = input.habits
    .filter((habit) => habit.status === "ACTIVE" && habit.todayScheduled && !habit.completedToday && habit.currentStreak > 0)
    .sort((a, b) => b.currentStreak - a.currentStreak)[0];
  if (streak) {
    const next = streak.currentStreak + 1;
    const record = next > streak.bestStreak ? " — your best so far" : next === streak.bestStreak ? " — matching your best" : "";
    notices.push({
      id: "habit-streak", tone: "ai", tag: "Streak opportunity",
      text: `One check-in today takes ${streak.title} to a ${next}-day streak${record}.`,
      action: { label: "Find a time", href: askHref(`When could I fit in ${streak.title} today?`) },
    });
  }
  return notices.slice(0, NOTICE_LIMIT);
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00Z`));
}
