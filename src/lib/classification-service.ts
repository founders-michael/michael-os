import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { authorizeProjectAccess } from "@/lib/organization-structure-service";
import { resolveWorkTaskActor, workTaskScopeOf } from "@/lib/work-task-service";
import { canEditWorkTask, canViewWorkTask } from "@/lib/work-task-permissions";
import type { ClassifiableEntityType } from "@/lib/taxonomy-registry";
import { suggestTaskCategory, type CategorySuggestion } from "@/lib/intelligence-client";
import type { AIProviderName } from "@/lib/ai/config";
import type {
  PersonalClassificationCreateInput, PersonalClassificationListInput, WorkClassificationCreateInput, WorkClassificationListInput,
} from "@/lib/classification-validation";

/**
 * Classifications place an existing record in a registered taxonomy category
 * (CLAUDE.md §10.4). The database enforces most of the invariants — exactly
 * one record, the owner column matching the record's owner, no personal record
 * under an organization, confidence only on inferences — so this service adds
 * what it cannot: who may see or change a record, and which categories accept
 * which record types.
 *
 * Every row a person adds here is USER_INPUT. Inferences (AI_INFERENCE) are
 * written only by the suggest functions below, when the user asks Michael to
 * suggest a category for a task; they carry the model's confidence and a
 * sourceRef (provider, model, prompt version) and are never shown as fact.
 * Confirming one adds a separate USER_INPUT row beside it.
 */
export class ClassificationError extends OrganizationApiError {}

type PersonalType = PersonalClassificationListInput["entityType"];
type WorkType = WorkClassificationListInput["entityType"];

const RECORD_COLUMN = {
  TASK: "taskId", GOAL: "goalId", HABIT: "habitId", CALENDAR_EVENT: "calendarEventId", WORK_TASK: "workTaskId", PROJECT: "projectId",
} as const satisfies Record<ClassifiableEntityType, string>;

const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 } as const;

const rowSelect = {
  id: true, taskId: true, goalId: true, habitId: true, calendarEventId: true, workTaskId: true, projectId: true,
  source: true, confidence: true, recordedAt: true,
  category: { select: { key: true, name: true, namespace: true, sensitivity: true, status: true } },
} as const;
type Row = Prisma.EntityClassificationGetPayload<{ select: typeof rowSelect }>;

const INFERRED = new Set(["AI_INFERENCE", "AI_PREDICTION"]);

function serialize(row: Row) {
  const [entityType, entityId] = (Object.entries(RECORD_COLUMN) as [ClassifiableEntityType, keyof Row][])
    .map(([type, column]) => [type, row[column]] as const)
    .find(([, value]) => typeof value === "string") as [ClassifiableEntityType, string];
  return {
    id: row.id,
    entityType,
    entityId,
    category: { key: row.category.key, name: row.category.name, namespace: row.category.namespace.toLowerCase(), sensitivity: row.category.sensitivity, active: row.category.status === "ACTIVE" },
    source: row.source,
    /** True for anything Michael inferred: show it as a suggestion, never as fact. */
    inferred: INFERRED.has(row.source),
    confidence: row.confidence === null ? null : Number(row.confidence),
    recordedAt: row.recordedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** A lost Serializable race arrives as P2034 / 40001, not as the unique violation; retry so the loser fails on its own guard. */
function isSerializationConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("40001") || message.includes("could not serialize access") || message.includes("TransactionWriteConflict");
}

async function runSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, onDuplicate: () => never): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, serializable);
    } catch (error) {
      if (error instanceof OrganizationApiError) throw error;
      if (isUniqueViolation(error)) onDuplicate();
      if (isSerializationConflict(error) && attempt < 2) continue;
      throw error;
    }
  }
  throw new ClassificationError(409, "CLASSIFICATION_CONFLICT", "That record changed at the same time. Please try again.");
}

const notFound = () => new ClassificationError(404, "RECORD_NOT_FOUND", "That record was not found.");
const alreadyClassified = (): never => { throw new ClassificationError(409, "ALREADY_CLASSIFIED", "That record is already in this category."); };

/** The category must be registered, active, in the product's namespaces and accept this record type. */
async function requireCategory(tx: Prisma.TransactionClient, key: string, product: "lifestyle" | "work", type: ClassifiableEntityType) {
  const category = await tx.taxonomyCategory.findUnique({ where: { key }, select: { status: true, namespace: true, entityTypes: true } });
  const namespaces = product === "lifestyle" ? ["PERSONAL"] : ["WORK", "INDUSTRY"];
  if (!category || category.status !== "ACTIVE" || !namespaces.includes(category.namespace)) {
    throw new ClassificationError(400, "CATEGORY_NOT_AVAILABLE", "Choose an active category from the catalog.");
  }
  if (!category.entityTypes.includes(type)) throw new ClassificationError(400, "CATEGORY_NOT_FOR_RECORD", "That category does not apply to this kind of record.");
}

// ---------------------------------------------------------------- catalog

export async function listTaxonomyCategories(product: "lifestyle" | "work", page: number, limit: number) {
  const where = { status: "ACTIVE" as const, namespace: { in: product === "lifestyle" ? ["PERSONAL" as const] : ["WORK" as const, "INDUSTRY" as const] } };
  const [categories, total] = await Promise.all([
    prisma.taxonomyCategory.findMany({
      where, orderBy: { key: "asc" }, skip: (page - 1) * limit, take: limit,
      select: { key: true, parentKey: true, level: true, name: true, description: true, sensitivity: true, entityTypes: true },
    }),
    prisma.taxonomyCategory.count({ where }),
  ]);
  return { categories, page, limit, total, pages: Math.ceil(total / limit) };
}

// ---------------------------------------------------------------- LifestyleOS

/** Owner-scoped existence check: another user's record is indistinguishable from a missing one. */
async function personalRecordExists(client: Prisma.TransactionClient | typeof prisma, userId: string, type: PersonalType, id: string) {
  const where = { id, userId };
  const select = { id: true };
  if (type === "TASK") return Boolean(await client.task.findFirst({ where, select }));
  if (type === "GOAL") return Boolean(await client.goal.findFirst({ where, select }));
  if (type === "HABIT") return Boolean(await client.habit.findFirst({ where, select }));
  return Boolean(await client.calendarEvent.findFirst({ where, select }));
}

export async function listPersonalClassifications(userId: string, input: PersonalClassificationListInput) {
  if (!(await personalRecordExists(prisma, userId, input.entityType, input.entityId))) throw notFound();
  const where = { userId, [RECORD_COLUMN[input.entityType]]: input.entityId };
  const [rows, total] = await Promise.all([
    prisma.entityClassification.findMany({ where, orderBy: { recordedAt: "desc" }, skip: (input.page - 1) * input.limit, take: input.limit, select: rowSelect }),
    prisma.entityClassification.count({ where }),
  ]);
  return { classifications: rows.map(serialize), page: input.page, limit: input.limit, total };
}

export async function addPersonalClassification(userId: string, input: PersonalClassificationCreateInput) {
  return serialize(await runSerializable(async (tx) => {
    if (!(await personalRecordExists(tx, userId, input.entityType, input.entityId))) throw notFound();
    await requireCategory(tx, input.categoryKey, "lifestyle", input.entityType);
    return tx.entityClassification.create({
      data: { userId, [RECORD_COLUMN[input.entityType]]: input.entityId, categoryKey: input.categoryKey, source: "USER_INPUT" },
      select: rowSelect,
    });
  }, alreadyClassified));
}

export async function removePersonalClassification(userId: string, classificationId: string) {
  await runSerializable(async (tx) => {
    const row = await tx.entityClassification.findFirst({ where: { id: classificationId, userId }, select: { id: true } });
    if (!row) throw new ClassificationError(404, "CLASSIFICATION_NOT_FOUND", "That classification was not found.");
    await tx.entityClassification.delete({ where: { id: row.id } });
  }, alreadyClassified);
}

/** The user accepts one of Michael's inferences: a USER_INPUT row is added beside it; the inference stays as recorded. */
export async function confirmPersonalInference(userId: string, classificationId: string) {
  return serialize(await runSerializable(async (tx) => {
    const row = await tx.entityClassification.findFirst({ where: { id: classificationId, userId }, select: { ...rowSelect, categoryKey: true } });
    if (!row) throw new ClassificationError(404, "CLASSIFICATION_NOT_FOUND", "That classification was not found.");
    if (!INFERRED.has(row.source)) throw new ClassificationError(409, "NOT_AN_INFERENCE", "Only a suggested category can be confirmed.");
    const { entityType, entityId } = serialize(row);
    await requireCategory(tx, row.categoryKey, "lifestyle", entityType);
    return tx.entityClassification.create({
      data: { userId, [RECORD_COLUMN[entityType]]: entityId, categoryKey: row.categoryKey, source: "USER_INPUT" },
      select: rowSelect,
    });
  }, (): never => { throw new ClassificationError(409, "ALREADY_CONFIRMED", "You have already confirmed this category."); }));
}

// ---------------------------------------------------------------- WorkOS

/**
 * Who may see or change a work record's classifications: exactly who may see
 * or edit the record. Reuses the work-task and project rules rather than
 * defining new ones (CLAUDE.md §7).
 */
async function authorizeWorkRecord(organizationId: string, userId: string, type: WorkType, id: string, mode: "view" | "edit") {
  if (type === "PROJECT") {
    const access = await authorizeProjectAccess(organizationId, id, userId);
    if (mode === "edit" && !access.canManage) throw new ClassificationError(403, "FORBIDDEN", "You cannot change this project's categories.");
    return;
  }
  const actor = await resolveWorkTaskActor(organizationId, userId);
  const task = await prisma.workTask.findFirst({
    where: { id, organizationId },
    select: { id: true, createdById: true, projectId: true, teamId: true, assignments: { where: { removedAt: null, assignee: { status: "ACTIVE" } }, select: { userId: true } } },
  });
  if (!task || !canViewWorkTask(actor, workTaskScopeOf(task))) throw notFound();
  if (mode === "edit" && !canEditWorkTask(actor, workTaskScopeOf(task))) throw new ClassificationError(403, "FORBIDDEN", "You cannot change this task's categories.");
}

export async function listWorkClassifications(organizationId: string, userId: string, input: WorkClassificationListInput) {
  await authorizeWorkRecord(organizationId, userId, input.entityType, input.entityId, "view");
  const where = { organizationId, [RECORD_COLUMN[input.entityType]]: input.entityId };
  const [rows, total] = await Promise.all([
    prisma.entityClassification.findMany({ where, orderBy: { recordedAt: "desc" }, skip: (input.page - 1) * input.limit, take: input.limit, select: rowSelect }),
    prisma.entityClassification.count({ where }),
  ]);
  return { classifications: rows.map(serialize), page: input.page, limit: input.limit, total };
}

export async function addWorkClassification(organizationId: string, userId: string, input: WorkClassificationCreateInput) {
  await authorizeWorkRecord(organizationId, userId, input.entityType, input.entityId, "edit");
  return serialize(await runSerializable(async (tx) => {
    const exists = input.entityType === "PROJECT"
      ? await tx.project.findFirst({ where: { id: input.entityId, organizationId }, select: { id: true } })
      : await tx.workTask.findFirst({ where: { id: input.entityId, organizationId }, select: { id: true } });
    if (!exists) throw notFound();
    await requireCategory(tx, input.categoryKey, "work", input.entityType);
    return tx.entityClassification.create({
      data: { organizationId, [RECORD_COLUMN[input.entityType]]: input.entityId, categoryKey: input.categoryKey, source: "USER_INPUT", createdById: userId },
      select: rowSelect,
    });
  }, alreadyClassified));
}

async function workRowFor(organizationId: string, classificationId: string) {
  const row = await prisma.entityClassification.findFirst({ where: { id: classificationId, organizationId }, select: { ...rowSelect, categoryKey: true } });
  if (!row) throw new ClassificationError(404, "CLASSIFICATION_NOT_FOUND", "That classification was not found.");
  return row;
}

export async function removeWorkClassification(organizationId: string, userId: string, classificationId: string) {
  const row = await workRowFor(organizationId, classificationId);
  const { entityType, entityId } = serialize(row);
  await authorizeWorkRecord(organizationId, userId, entityType as WorkType, entityId, "edit");
  await runSerializable(async (tx) => {
    const current = await tx.entityClassification.findFirst({ where: { id: row.id, organizationId }, select: { id: true } });
    if (!current) throw new ClassificationError(404, "CLASSIFICATION_NOT_FOUND", "That classification was not found.");
    await tx.entityClassification.delete({ where: { id: current.id } });
  }, alreadyClassified);
}

export async function confirmWorkInference(organizationId: string, userId: string, classificationId: string) {
  const row = await workRowFor(organizationId, classificationId);
  const { entityType, entityId } = serialize(row);
  await authorizeWorkRecord(organizationId, userId, entityType as WorkType, entityId, "edit");
  if (!INFERRED.has(row.source)) throw new ClassificationError(409, "NOT_AN_INFERENCE", "Only a suggested category can be confirmed.");
  return serialize(await runSerializable(async (tx) => {
    await requireCategory(tx, row.categoryKey, "work", entityType);
    return tx.entityClassification.create({
      data: { organizationId, [RECORD_COLUMN[entityType]]: entityId, categoryKey: row.categoryKey, source: "USER_INPUT", createdById: userId },
      select: rowSelect,
    });
  }, (): never => { throw new ClassificationError(409, "ALREADY_CONFIRMED", "This category is already confirmed."); }));
}

// ---------------------------------------------------------------- suggestions (Phase 4)

type SuggestionTerms = { expectedProvider: AIProviderName; dataUseAcknowledged: boolean };

/**
 * Stores Michael's pick as AI_INFERENCE beside the record. The model call runs
 * before the transaction (a model is slow; a serializable transaction must not
 * wait on it), so the write re-checks the record and the category. A repeat
 * suggestion of the same category returns the inference already recorded
 * rather than rewriting it.
 */
async function recordInference(
  suggestion: CategorySuggestion & { categoryKey: string; confidence: number },
  scope: { userId: string } | { organizationId: string },
  record: { type: "TASK" | "WORK_TASK"; id: string },
) {
  const product = record.type === "TASK" ? "lifestyle" : "work";
  const column = RECORD_COLUMN[record.type];
  return serialize(await runSerializable(async (tx) => {
    const exists = "userId" in scope
      ? await tx.task.findFirst({ where: { id: record.id, userId: scope.userId }, select: { id: true } })
      : await tx.workTask.findFirst({ where: { id: record.id, organizationId: scope.organizationId }, select: { id: true } });
    if (!exists) throw notFound();
    await requireCategory(tx, suggestion.categoryKey, product, record.type);
    const where = { ...scope, [column]: record.id, categoryKey: suggestion.categoryKey, source: "AI_INFERENCE" as const };
    const recorded = await tx.entityClassification.findFirst({ where, select: rowSelect });
    if (recorded) return recorded;
    return tx.entityClassification.create({
      data: { ...where, confidence: new Prisma.Decimal(suggestion.confidence.toFixed(3)), sourceRef: suggestion.sourceRef.slice(0, 200) },
      select: rowSelect,
    });
  }, alreadyClassified));
}

function hasPick(suggestion: CategorySuggestion): suggestion is CategorySuggestion & { categoryKey: string; confidence: number } {
  return suggestion.categoryKey !== null && suggestion.confidence !== null;
}

type SuggestableTask = { id: string; title: string; description: string | null };

/**
 * Step one of a suggestion: authorize the record and load the text the model
 * will see. Runs before the AI gate (enabled, provider terms, rate limit), so
 * another user's record answers 404 whether or not AI is available.
 */
export async function personalTaskForSuggestion(userId: string, taskId: string): Promise<SuggestableTask> {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId }, select: { id: true, title: true, description: true } });
  if (!task) throw notFound();
  return task;
}

/** Who may suggest is who may classify: whoever may edit the work task. */
export async function workTaskForSuggestion(organizationId: string, userId: string, taskId: string): Promise<SuggestableTask> {
  await authorizeWorkRecord(organizationId, userId, "WORK_TASK", taskId, "edit");
  const task = await prisma.workTask.findFirst({ where: { id: taskId, organizationId }, select: { id: true, title: true, description: true } });
  if (!task) throw notFound();
  return task;
}

/** Step two: only this task's title and description reach the model. */
export async function suggestPersonalTaskCategory(userId: string, task: SuggestableTask, terms: SuggestionTerms) {
  const suggestion = await suggestTaskCategory({ product: "lifestyle", record: { title: task.title, description: task.description }, ...terms });
  if (!hasPick(suggestion)) return { suggestion: null };
  return { suggestion: await recordInference(suggestion, { userId }, { type: "TASK", id: task.id }) };
}

export async function suggestWorkTaskCategory(organizationId: string, task: SuggestableTask, terms: SuggestionTerms) {
  const suggestion = await suggestTaskCategory({ product: "work", record: { title: task.title, description: task.description }, ...terms });
  if (!hasPick(suggestion)) return { suggestion: null };
  return { suggestion: await recordInference(suggestion, { organizationId }, { type: "WORK_TASK", id: task.id }) };
}

/** LifestyleOS routes: the service's own errors keep their status; anything else is logged without detail. */
export function personalClassificationErrorResponse(error: unknown) {
  if (error instanceof ClassificationError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  console.error("[classifications] A personal classification request failed.");
  return Response.json({ error: "We couldn't update categories right now. Please try again." }, { status: 500 });
}
