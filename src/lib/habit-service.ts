import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { HabitFrequency, HabitStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { localDateAt } from "@/lib/task-service";
import { calculateHabitStats, isHabitScheduled, shiftLocalDate } from "@/lib/habit-stats";
import type { CheckInCreateInput, HabitCreateInput, HabitListQuery, HabitUpdateInput } from "@/lib/habit-validation";

const habitInclude = { checkIns: { orderBy: { localDate: "desc" as const } } };
type HabitWithCheckIns = Prisma.HabitGetPayload<{ include: typeof habitInclude }>;
export type HabitDto = {
  id: string; title: string; description: string | null; frequency: HabitFrequency; weekdays: number[]; status: HabitStatus;
  createdAt: string; updatedAt: string; today: string; todayScheduled: boolean; completedToday: boolean;
  currentStreak: number; bestStreak: number; completionPercentage: number; eligibleDays: number; completedDays: number;
  periodStart: string; periodEnd: string; checkIns: { id: string; localDate: string; completedAt: string }[];
};

function dateOnly(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function dateText(value: Date) { return value.toISOString().slice(0, 10); }

function toDto(habit: HabitWithCheckIns, timeZone: string, now = new Date()): HabitDto {
  const today = localDateAt(timeZone, now);
  const createdLocalDate = localDateAt(timeZone, habit.createdAt);
  const checkInDates = habit.checkIns.map((checkIn) => dateText(checkIn.localDate));
  const stats = calculateHabitStats({ frequency: habit.frequency, weekdays: habit.weekdays, createdLocalDate, today, checkInDates });
  const recentStart = shiftLocalDate(today, -29);
  return {
    id: habit.id, title: habit.title, description: habit.description, frequency: habit.frequency, weekdays: habit.weekdays,
    status: habit.status, createdAt: habit.createdAt.toISOString(), updatedAt: habit.updatedAt.toISOString(), today,
    todayScheduled: isHabitScheduled(habit.frequency, habit.weekdays, today), completedToday: checkInDates.includes(today),
    ...stats,
    checkIns: habit.checkIns.filter((checkIn) => dateText(checkIn.localDate) >= recentStart).map((checkIn) => ({
      id: checkIn.id, localDate: dateText(checkIn.localDate), completedAt: checkIn.completedAt.toISOString(),
    })),
  };
}

export async function listHabits(userId: string, timeZone: string, query: HabitListQuery = {}) {
  const habits = await prisma.habit.findMany({
    where: { userId, ...(query.status ? { status: query.status } : {}) },
    include: habitInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return { habits: habits.map((habit) => toDto(habit, timeZone)) };
}

export async function getHabit(userId: string, habitId: string, timeZone: string) {
  const habit = await prisma.habit.findFirst({ where: { id: habitId, userId }, include: habitInclude });
  return habit ? toDto(habit, timeZone) : null;
}

export async function createHabit(userId: string, input: HabitCreateInput) {
  return prisma.habit.create({ data: { userId, title: input.title, description: input.description ?? null, frequency: input.frequency, weekdays: input.weekdays } });
}

export async function updateHabit(userId: string, habitId: string, input: HabitUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.habit.findFirst({ where: { id: habitId, userId } });
    if (!current) return null;
    const frequency = input.frequency ?? current.frequency;
    const nextWeekdays = input.weekdays ?? current.weekdays;
    if (frequency === "SELECTED_DAYS" && nextWeekdays.length === 0) throw new Error("HABIT_DAYS_REQUIRED");
    if (frequency === "DAILY" && nextWeekdays.length > 0 && input.weekdays !== undefined) throw new Error("DAILY_HABIT_HAS_DAYS");
    return tx.habit.update({
      where: { id: habitId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.frequency === "DAILY" ? { weekdays: [] } : input.weekdays !== undefined ? { weekdays: input.weekdays } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
  });
}

export async function deleteHabit(userId: string, habitId: string) {
  const result = await prisma.habit.deleteMany({ where: { id: habitId, userId } });
  return result.count > 0;
}

export async function createCheckIn(userId: string, habitId: string, timeZone: string, input: CheckInCreateInput) {
  const today = localDateAt(timeZone);
  const localDate = input.localDate ?? today;
  if (localDate > today) throw new Error("FUTURE_CHECK_IN");
  const habit = await prisma.habit.findFirst({ where: { id: habitId, userId }, select: { id: true, frequency: true, weekdays: true, status: true } });
  if (!habit) return null;
  if (habit.status !== "ACTIVE") throw new Error("HABIT_ARCHIVED");
  if (!isHabitScheduled(habit.frequency, habit.weekdays, localDate)) throw new Error("HABIT_NOT_SCHEDULED");
  const uniqueKey = { habitId_localDate: { habitId, localDate: dateOnly(localDate) } };
  const existing = await prisma.habitCheckIn.findUnique({ where: uniqueKey });
  if (existing) return { checkIn: existing, created: false };
  try {
    const checkIn = await prisma.habitCheckIn.create({ data: { habitId, localDate: dateOnly(localDate) } });
    return { checkIn, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const checkIn = await prisma.habitCheckIn.findUnique({ where: uniqueKey });
      if (checkIn) return { checkIn, created: false };
    }
    throw error;
  }
}

export async function deleteCheckIn(userId: string, habitId: string, checkInId: string) {
  const owner = await prisma.habit.findFirst({ where: { id: habitId, userId }, select: { id: true } });
  if (!owner) return false;
  const result = await prisma.habitCheckIn.deleteMany({ where: { id: checkInId, habitId } });
  return result.count > 0;
}

export async function getHabitDashboardData(userId: string, timeZone: string) {
  const { habits } = await listHabits(userId, timeZone, { status: "ACTIVE" });
  const today = localDateAt(timeZone);
  const scheduled = habits.filter((habit) => habit.todayScheduled);
  return {
    today,
    summary: { active: habits.length, scheduledToday: scheduled.length, completedToday: scheduled.filter((habit) => habit.completedToday).length },
    habits: scheduled.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 4),
  };
}
