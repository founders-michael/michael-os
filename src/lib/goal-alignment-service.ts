import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { invalidateCacheTags } from "@/lib/server-cache";
import { lifestyleInvalidationTags } from "@/lib/resource-cache";
import { MAX_GOAL_LINKS } from "@/lib/task-intelligence-validation";

/**
 * Which of a user's goals a personal task supports: `EntityRelationship` rows
 * of kind TASK_SUPPORTS_GOAL (CLAUDE.md §10.4). The composite foreign keys
 * make a link between two users' records impossible; this service adds the
 * rules the database cannot — the owner's session, at most five goals, and
 * that a new link must point at an active goal.
 *
 * Every row is USER_INPUT. Removing a link deletes its row: a link is current
 * state, not history.
 */
export class GoalAlignmentError extends OrganizationApiError {}

const KIND = "TASK_SUPPORTS_GOAL" as const;
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 } as const;
const taskNotFound = () => new GoalAlignmentError(404, "TASK_NOT_FOUND", "That task was not found.");

function isSerializationConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("40001") || message.includes("could not serialize access") || message.includes("TransactionWriteConflict");
}

const linkSelect = {
  goal: { select: { id: true, title: true, status: true, progress: true, targetDate: true } },
} as const;

function serializeLinks(rows: Prisma.EntityRelationshipGetPayload<{ select: typeof linkSelect }>[]) {
  return rows.map(({ goal }) => ({
    id: goal!.id, title: goal!.title, status: goal!.status, progress: goal!.progress,
    targetDate: goal!.targetDate?.toISOString().slice(0, 10) ?? null,
  }));
}

/** Bounded by design: a task carries at most MAX_GOAL_LINKS links, so this list needs no paging. */
export async function listTaskGoalLinks(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { id: true } });
  if (!task) throw taskNotFound();
  const rows = await prisma.entityRelationship.findMany({
    where: { userId, kind: KIND, taskId: task.id, source: "USER_INPUT" },
    orderBy: { recordedAt: "asc" },
    take: MAX_GOAL_LINKS,
    select: linkSelect,
  });
  return { goals: serializeLinks(rows) };
}

/** Replaces the task's goal links with `goalIds`. A goal already linked may stay linked after it is completed or archived. */
export async function setTaskGoalLinks(userId: string, taskId: string, goalIds: string[]) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const task = await tx.task.findFirst({ where: { id: taskId, userId }, select: { id: true } });
        if (!task) throw taskNotFound();
        const existing = await tx.entityRelationship.findMany({
          where: { userId, kind: KIND, taskId: task.id, source: "USER_INPUT" },
          select: { id: true, goalId: true },
        });
        const linked = new Set(existing.map(({ goalId }) => goalId));
        const added = goalIds.filter((id) => !linked.has(id));
        if (added.length) {
          const goals = await tx.goal.findMany({ where: { id: { in: added }, userId, status: "ACTIVE" }, select: { id: true } });
          if (goals.length !== added.length) throw new GoalAlignmentError(400, "GOAL_NOT_AVAILABLE", "Choose active goals of your own.");
        }
        const removed = existing.filter(({ goalId }) => !goalIds.includes(goalId!)).map(({ id }) => id);
        if (removed.length) await tx.entityRelationship.deleteMany({ where: { id: { in: removed }, userId } });
        if (added.length) {
          await tx.entityRelationship.createMany({
            data: added.map((goalId) => ({ userId, kind: KIND, taskId: task.id, goalId, source: "USER_INPUT" as const })),
          });
        }
        return tx.entityRelationship.findMany({
          where: { userId, kind: KIND, taskId: task.id, source: "USER_INPUT" },
          orderBy: { recordedAt: "asc" },
          take: MAX_GOAL_LINKS,
          select: linkSelect,
        });
      }, serializable);
      // Goal links feed task prioritization, which is cached under the task tags.
      await invalidateCacheTags(lifestyleInvalidationTags.taskMutation(userId, taskId));
      return { goals: serializeLinks(result) };
    } catch (error) {
      if (error instanceof GoalAlignmentError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new GoalAlignmentError(409, "LINK_CONFLICT", "Those goals changed at the same time. Please try again.");
      }
      if (isSerializationConflict(error) && attempt < 2) continue;
      throw error;
    }
  }
  throw new GoalAlignmentError(409, "LINK_CONFLICT", "Those goals changed at the same time. Please try again.");
}

/**
 * Target dates of the active goals each task supports, for an explicit set of
 * task ids (served by the [userId, kind, taskId, …] unique index). One query.
 */
export async function activeGoalTargetsForTasks(userId: string, taskIds: string[]) {
  const targets = new Map<string, (Date | null)[]>(taskIds.map((id) => [id, []]));
  if (taskIds.length === 0) return targets;
  const rows = await prisma.entityRelationship.findMany({
    where: { userId, kind: KIND, taskId: { in: taskIds }, source: "USER_INPUT", goal: { status: "ACTIVE" } },
    select: { taskId: true, goal: { select: { targetDate: true } } },
  });
  for (const row of rows) targets.get(row.taskId!)?.push(row.goal!.targetDate);
  return targets;
}

export function goalAlignmentErrorResponse(error: unknown) {
  if (error instanceof GoalAlignmentError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  console.error("[goal-alignment] A goal link request failed.");
  return Response.json({ error: "We couldn't update this task's goals. Please try again." }, { status: 500 });
}
