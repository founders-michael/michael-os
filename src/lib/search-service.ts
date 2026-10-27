import "server-only";

import { prisma } from "@/lib/prisma";
import { effectiveTimeZone } from "@/lib/time-zone";

export type WorkspaceSearchResult = {
  id: string;
  type: "Task" | "Goal" | "Habit" | "Calendar";
  title: string;
  detail: string;
  href: string;
};

export async function searchWorkspace(userId: string, query: string): Promise<WorkspaceSearchResult[]> {
  const contains = { contains: query, mode: "insensitive" as const };
  const [profile, tasks, goals, habits, events] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId }, select: { timeZone: true } }),
    prisma.task.findMany({ where: { userId, OR: [{ title: contains }, { description: contains }] }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, status: true, priority: true } }),
    prisma.goal.findMany({ where: { userId, OR: [{ title: contains }, { description: contains }, { category: contains }] }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, status: true, progress: true } }),
    prisma.habit.findMany({ where: { userId, OR: [{ title: contains }, { description: contains }] }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, status: true, frequency: true } }),
    prisma.calendarEvent.findMany({ where: { userId, cancelledAt: null, AND: [{ OR: [{ eventType: { not: "TASK_SESSION" } }, { task: { is: { status: { not: "COMPLETED" } } } }] }, { OR: [{ title: contains }, { description: contains }] }] }, orderBy: { startAt: "desc" }, take: 5, select: { id: true, title: true, eventType: true, startAt: true } }),
  ]);
  const timeZone = effectiveTimeZone(profile?.timeZone);
  const eventDate = new Intl.DateTimeFormat("en", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return [
    ...tasks.map((task) => ({ id: task.id, type: "Task" as const, title: task.title, detail: `${task.status.replaceAll("_", " ")} · ${task.priority.toLowerCase()} priority`, href: "/tasks" })),
    ...goals.map((goal) => ({ id: goal.id, type: "Goal" as const, title: goal.title, detail: `${goal.status.toLowerCase()} · ${goal.progress}% progress`, href: "/goals" })),
    ...habits.map((habit) => ({ id: habit.id, type: "Habit" as const, title: habit.title, detail: `${habit.status.toLowerCase()} · ${habit.frequency === "DAILY" ? "daily" : "selected days"}`, href: "/habits" })),
    ...events.map((event) => ({ id: event.id, type: "Calendar" as const, title: event.title, detail: `${event.eventType.toLowerCase().replaceAll("_", " ")} · ${eventDate.format(event.startAt)} (${timeZone})`, href: "/calendar" })),
  ];
}
