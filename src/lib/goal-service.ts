import "server-only";

import type { GoalMilestoneStatus, GoalStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { localDateAt } from "@/lib/task-service";
import type { GoalCreateInput, GoalListQuery, GoalUpdateInput, MilestoneCreateInput, MilestoneUpdateInput } from "@/lib/goal-validation";

const goalInclude = { milestones: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }] } };

type GoalWithMilestones = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;
export type GoalDto = {
  id: string; title: string; description: string | null; category: string | null; status: GoalStatus; progress: number;
  targetDate: string | null; completedAt: string | null; createdAt: string; updatedAt: string;
  milestones: { id: string; title: string; description: string | null; status: GoalMilestoneStatus; position: number; completedAt: string | null; createdAt: string; updatedAt: string }[];
  milestoneCount: number; completedMilestoneCount: number;
};

function toDto(goal: GoalWithMilestones): GoalDto {
  return {
    id: goal.id, title: goal.title, description: goal.description, category: goal.category, status: goal.status, progress: goal.progress,
    targetDate: goal.targetDate?.toISOString().slice(0, 10) ?? null,
    completedAt: goal.completedAt?.toISOString() ?? null,
    createdAt: goal.createdAt.toISOString(), updatedAt: goal.updatedAt.toISOString(),
    milestones: goal.milestones.map((milestone) => ({
      id: milestone.id, title: milestone.title, description: milestone.description, status: milestone.status, position: milestone.position,
      completedAt: milestone.completedAt?.toISOString() ?? null, createdAt: milestone.createdAt.toISOString(), updatedAt: milestone.updatedAt.toISOString(),
    })),
    milestoneCount: goal.milestones.length,
    completedMilestoneCount: goal.milestones.filter(({ status }) => status === "COMPLETED").length,
  };
}

function dateOnly(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function listGoals(userId: string, query: GoalListQuery) {
  const where: Prisma.GoalWhereInput = { userId, ...(query.status ? { status: query.status } : {}) };
  const orderBy: Prisma.GoalOrderByWithRelationInput[] = query.sort === "targetDate"
    ? [{ targetDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }]
    : [{ createdAt: "desc" }];
  const goals = await prisma.goal.findMany({ where, include: goalInclude, orderBy });
  return { goals: goals.map(toDto) };
}

export async function getGoal(userId: string, goalId: string) {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId }, include: goalInclude });
  return goal ? toDto(goal) : null;
}

export async function createGoal(userId: string, input: GoalCreateInput) {
  const goal = await prisma.goal.create({
    data: { userId, title: input.title, description: input.description ?? null, category: input.category || null, targetDate: dateOnly(input.targetDate), progress: input.progress },
    include: goalInclude,
  });
  return toDto(goal);
}

export async function updateGoal(userId: string, goalId: string, input: GoalUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true, status: true } });
    if (!current) return null;
    // Completed progress is locked until the goal is explicitly reopened. Completing always sets 100.
    if (current.status === "COMPLETED" && input.progress !== undefined && input.status !== "ACTIVE" && input.status !== "COMPLETED") {
      throw new Error("GOAL_REOPEN_REQUIRED");
    }
    const data: Prisma.GoalUpdateManyMutationInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category || null } : {}),
      ...(input.targetDate !== undefined ? { targetDate: dateOnly(input.targetDate) } : {}),
      ...(input.progress !== undefined ? { progress: input.progress } : {}),
    };
    if (input.status === "COMPLETED") {
      data.status = "COMPLETED";
      data.progress = 100;
      data.completedAt = new Date();
    } else if (input.status === "ACTIVE" && current.status === "COMPLETED") {
      data.status = "ACTIVE";
      data.completedAt = null;
    } else if (input.status === "ACTIVE" || input.status === "ARCHIVED") {
      data.status = input.status;
    }
    await tx.goal.updateMany({ where: { id: goalId, userId }, data });
    const updated = await tx.goal.findFirst({ where: { id: goalId, userId }, include: goalInclude });
    return updated ? toDto(updated) : null;
  });
}

export async function deleteGoal(userId: string, goalId: string) {
  const result = await prisma.goal.deleteMany({ where: { id: goalId, userId } });
  return result.count > 0;
}

export async function createMilestone(userId: string, goalId: string, input: MilestoneCreateInput) {
  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
    if (!goal) return null;
    const last = await tx.goalMilestone.aggregate({ where: { goalId }, _max: { position: true } });
    const milestone = await tx.goalMilestone.create({ data: { goalId, title: input.title, description: input.description ?? null, position: (last._max.position ?? -1) + 1 } });
    return milestone;
  });
}

export async function updateMilestone(userId: string, goalId: string, milestoneId: string, input: MilestoneUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const parent = await tx.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
    if (!parent) return null;
    const current = await tx.goalMilestone.findFirst({ where: { id: milestoneId, goalId } });
    if (!current) return null;
    const data: Prisma.GoalMilestoneUpdateManyMutationInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.status !== undefined ? { status: input.status, completedAt: input.status === "COMPLETED" ? new Date() : null } : {}),
    };
    if (input.position !== undefined && input.position !== current.position) {
      const siblings = await tx.goalMilestone.findMany({ where: { goalId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
      const newPosition = Math.min(input.position, siblings.length - 1);
      const reordered = siblings.filter(({ id }) => id !== milestoneId);
      reordered.splice(newPosition, 0, current);
      for (const [position, milestone] of reordered.entries()) {
        await tx.goalMilestone.updateMany({ where: { id: milestone.id, goalId }, data: { position: 10001 + position } });
      }
      for (const [position, milestone] of reordered.entries()) {
        await tx.goalMilestone.updateMany({ where: { id: milestone.id, goalId }, data: { position } });
      }
      await tx.goalMilestone.updateMany({ where: { id: milestoneId, goalId }, data: { ...data, position: newPosition } });
    } else {
      await tx.goalMilestone.updateMany({ where: { id: milestoneId, goalId }, data });
    }
    return tx.goalMilestone.findFirst({ where: { id: milestoneId, goalId } });
  });
}

export async function deleteMilestone(userId: string, goalId: string, milestoneId: string) {
  const parent = await prisma.goal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!parent) return false;
  const deleted = await prisma.goalMilestone.deleteMany({ where: { id: milestoneId, goalId } });
  return deleted.count > 0;
}

export async function getGoalDashboardData(userId: string, timeZone: string) {
  const todayText = localDateAt(timeZone);
  const today = dateOnly(todayText)!;
  const horizon = dateOnly(addDays(todayText, 7))!;
  const [active, completed, approaching, recent] = await Promise.all([
    prisma.goal.count({ where: { userId, status: "ACTIVE" } }),
    prisma.goal.count({ where: { userId, status: "COMPLETED" } }),
    prisma.goal.findMany({ where: { userId, status: "ACTIVE", targetDate: { gte: today, lte: horizon } }, orderBy: [{ targetDate: "asc" }, { createdAt: "desc" }], take: 3, include: goalInclude }),
    prisma.goal.findMany({ where: { userId, status: "ACTIVE" }, orderBy: [{ updatedAt: "desc" }], take: 3, include: goalInclude }),
  ]);
  return { summary: { active, completed, approaching: approaching.length, today: todayText }, goals: recent.map(toDto) };
}

function addDays(value: string, days: number) {
  const date = dateOnly(value)!;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
