import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { OrganizationApiError } from "@/lib/organization-authorization";
import { getCached, invalidateCacheTags } from "@/lib/server-cache";
import { cacheTtlSeconds, lifestyleInvalidationTags, resourceCacheTags, workInvalidationTags } from "@/lib/resource-cache";
import { calendarRange, localDateAt, shiftLocalDate } from "@/lib/calendar-date";
import { selectMemories } from "@/lib/intelligence-client";
import { assistantMemoryWhere } from "@/lib/memory-query";
import {
  MAX_MEMORIES_PER_OWNER, MEMORY_CONTEXT_LIMIT, MEMORY_QUERY_MAX,
  type MemoryInput, type MemoryListQuery, type MemorySensitivity,
} from "@/lib/memory-validation";

/**
 * Michael's memory (CLAUDE.md §10.7, Phase 5): short notes a person saved for
 * Michael to read. One owner per row — one user's, or one organization's,
 * never both (CHECK) — and every query here carries that owner in its `where`.
 *
 * Nothing is remembered on its own: every row is USER_INPUT, written by the
 * person through Settings or by pressing Save on a draft Michael proposed. An
 * edit saves a new version that supersedes the current one; a delete removes
 * every version, because "forget this" must not leave the old text behind.
 *
 * Authorization is the caller's: routes and tools resolve the owner from the
 * session (and the organization permission) before calling in.
 */
export class MemoryError extends OrganizationApiError {}

/** Organizations have no time zone yet; the same clock delivery risk and task priorities use. */
export const ORGANIZATION_MEMORY_CLOCK = "Asia/Kolkata";

export type MemoryOwner =
  | { kind: "user"; userId: string; timeZone: string }
  | { kind: "organization"; organizationId: string; actorUserId: string; timeZone: string };

export type MemoryDto = {
  id: string;
  content: string;
  sensitivity: MemorySensitivity;
  /** Last local day it applies, or null for "until deleted". */
  keepUntil: string | null;
  expired: boolean;
  /** When this version was saved. */
  savedAt: string;
  /** True when an earlier version was edited into this one. */
  edited: boolean;
  /** WorkOS only: who saved this version; null once that account is gone. */
  savedBy: string | null;
};

const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 } as const;
const notFound = () => new MemoryError(404, "MEMORY_NOT_FOUND", "That memory was not found.");

function isSerializationConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("40001") || message.includes("could not serialize access") || message.includes("TransactionWriteConflict");
}

/** Serializable with three attempts on a write conflict, so the loser re-reads and fails on its own guard. */
async function withSerializableRetry<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, serializable);
    } catch (error) {
      if (isSerializationConflict(error) && attempt < 2) continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new MemoryError(409, "MEMORY_CONFLICT", "That memory was changed at the same time. Reload and try again.");
      }
      throw error;
    }
  }
  throw new MemoryError(409, "MEMORY_CONFLICT", "That memory was changed at the same time. Reload and try again.");
}

function ownerWhere(owner: MemoryOwner) {
  return owner.kind === "user" ? { userId: owner.userId } : { organizationId: owner.organizationId };
}

function ownerTags(owner: MemoryOwner) {
  return owner.kind === "user" ? lifestyleInvalidationTags.memoryMutation(owner.userId) : workInvalidationTags.memoryMutation(owner.organizationId);
}

/** "Keep until 2026-12-31" means through that day on the owner's clock: it ends at the next local midnight. */
function expiryFor(keepUntil: string | null | undefined, timeZone: string) {
  if (!keepUntil) return null;
  if (keepUntil < localDateAt(timeZone)) throw new MemoryError(400, "INVALID_REQUEST", "Choose a keep-until date from today on.");
  return new Date(calendarRange(shiftLocalDate(keepUntil, 1), "day", timeZone).from);
}

const rowSelect = {
  id: true, content: true, sensitivity: true, expiresAt: true, recordedAt: true, supersedesId: true,
  createdBy: { select: { name: true } },
} as const;
type MemoryRow = Prisma.MemoryItemGetPayload<{ select: typeof rowSelect }>;

/** Cached shape: dates as ISO strings, so a cache hit and a miss look the same. */
type StoredMemory = { id: string; content: string; sensitivity: MemorySensitivity; expiresAt: string | null; savedAt: string; edited: boolean; savedBy: string | null };

function stored(row: MemoryRow): StoredMemory {
  return {
    id: row.id, content: row.content, sensitivity: row.sensitivity, expiresAt: row.expiresAt?.toISOString() ?? null,
    savedAt: row.recordedAt.toISOString(), edited: row.supersedesId !== null, savedBy: row.createdBy?.name ?? null,
  };
}

function present(memory: StoredMemory, owner: MemoryOwner, now = new Date()): MemoryDto {
  const expiresAt = memory.expiresAt ? new Date(memory.expiresAt) : null;
  return {
    id: memory.id, content: memory.content, sensitivity: memory.sensitivity,
    keepUntil: expiresAt ? localDateAt(owner.timeZone, new Date(expiresAt.getTime() - 1)) : null,
    expired: expiresAt !== null && expiresAt <= now,
    savedAt: memory.savedAt, edited: memory.edited,
    savedBy: owner.kind === "organization" ? memory.savedBy : null,
  };
}

/** Every current version for the owner, newest first: at most MAX_MEMORIES_PER_OWNER by construction. */
function currentMemories(owner: MemoryOwner) {
  const where = { ...ownerWhere(owner), supersededAt: null };
  return getCached({
    namespace: owner.kind === "user" ? "lifestyle" : "organization",
    scope: owner.kind === "user" ? { userId: owner.userId } : { organizationId: owner.organizationId },
    query: { resource: "memories" },
    tags: [owner.kind === "user" ? resourceCacheTags.lifestyleMemories(owner.userId) : resourceCacheTags.workMemories(owner.organizationId)],
    ttlSeconds: cacheTtlSeconds.memories,
    compute: async () => (await prisma.memoryItem.findMany({
      where, select: rowSelect, orderBy: [{ recordedAt: "desc" }, { id: "desc" }], take: MAX_MEMORIES_PER_OWNER,
    })).map(stored),
  });
}

export async function listMemories(owner: MemoryOwner, query: MemoryListQuery) {
  const all = await currentMemories(owner);
  const start = (query.page - 1) * query.limit;
  const now = new Date();
  return {
    memories: all.slice(start, start + query.limit).map((memory) => present(memory, owner, now)),
    total: all.length, page: query.page, limit: query.limit, maxMemories: MAX_MEMORIES_PER_OWNER,
  };
}

export async function createMemory(owner: MemoryOwner, input: MemoryInput) {
  const expiresAt = expiryFor(input.keepUntil, owner.timeZone);
  const row = await withSerializableRetry(async (tx) => {
    const count = await tx.memoryItem.count({ where: { ...ownerWhere(owner), supersededAt: null } });
    if (count >= MAX_MEMORIES_PER_OWNER) {
      throw new MemoryError(409, "MEMORY_LIMIT", `You can keep up to ${MAX_MEMORIES_PER_OWNER} memories. Delete one to add another.`);
    }
    return tx.memoryItem.create({
      data: {
        ...ownerWhere(owner), content: input.content, sensitivity: input.sensitivity, expiresAt, source: "USER_INPUT",
        ...(owner.kind === "organization" ? { createdById: owner.actorUserId } : {}),
      },
      select: rowSelect,
    });
  });
  await invalidateCacheTags(ownerTags(owner));
  return present(stored(row), owner);
}

/** Saves a new version superseding the current one; the earlier version stays as history. */
export async function updateMemory(owner: MemoryOwner, memoryId: string, input: MemoryInput) {
  const expiresAt = expiryFor(input.keepUntil, owner.timeZone);
  const row = await withSerializableRetry(async (tx) => {
    const current = await tx.memoryItem.findFirst({
      where: { id: memoryId, ...ownerWhere(owner), supersededAt: null },
      select: { ...rowSelect, lineageId: true },
    });
    if (!current) throw notFound();
    if (current.content === input.content && current.sensitivity === input.sensitivity
      && (current.expiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null)) return current;
    // Written by the id the scoped read returned (CLAUDE.md §2).
    await tx.memoryItem.update({ where: { id: current.id }, data: { supersededAt: new Date() } });
    return tx.memoryItem.create({
      data: {
        ...ownerWhere(owner), content: input.content, sensitivity: input.sensitivity, expiresAt, source: "USER_INPUT",
        lineageId: current.lineageId ?? current.id, supersedesId: current.id,
        ...(owner.kind === "organization" ? { createdById: owner.actorUserId } : {}),
      },
      select: rowSelect,
    });
  });
  await invalidateCacheTags(ownerTags(owner));
  return present(stored(row), owner);
}

/** Forgets a memory: every version of it, not only the current one. */
export async function deleteMemory(owner: MemoryOwner, memoryId: string) {
  const removed = await withSerializableRetry(async (tx) => {
    const current = await tx.memoryItem.findFirst({
      where: { id: memoryId, ...ownerWhere(owner), supersededAt: null },
      select: { id: true, lineageId: true },
    });
    if (!current) throw notFound();
    const root = current.lineageId ?? current.id;
    const { count } = await tx.memoryItem.deleteMany({ where: { ...ownerWhere(owner), OR: [{ id: root }, { lineageId: root }] } });
    return count;
  });
  await invalidateCacheTags(ownerTags(owner));
  return { deleted: true, versionsRemoved: removed };
}

/**
 * The memories Michael may read for one question. Owner, current version,
 * expiry and sensitivity are all filtered in SQL (CLAUDE.md §10.7: scope
 * before relevance), then the intelligence service ranks what is left. Not
 * cached: it runs only when Michael calls the tool, as one indexed query
 * bounded by the per-owner cap.
 *
 * `allowed` comes from the active provider: SENSITIVE never, PERSONAL only to
 * a paid-tier or local provider.
 */
export async function memoriesForAssistant(owner: MemoryOwner, input: { query: string | null; allowed: MemorySensitivity[] }) {
  const now = new Date();
  const rows = await prisma.memoryItem.findMany({
    where: assistantMemoryWhere(ownerWhere(owner), input.allowed, now),
    select: { content: true, recordedAt: true },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    take: MAX_MEMORIES_PER_OWNER,
  });
  if (rows.length === 0) return { savedMemories: 0, matchedQuestion: false, memories: [] as Array<{ text: string; writtenOn: string; aboutThisQuestion: boolean }> };
  const items = rows.map((row, index) => ({
    ref: `m${index + 1}`, text: row.content,
    ageDays: Math.max(0, Math.floor((now.getTime() - row.recordedAt.getTime()) / 86_400_000)),
  }));
  const query = input.query?.trim().slice(0, MEMORY_QUERY_MAX) || null;
  const selection = await selectMemories({ product: owner.kind === "user" ? "lifestyle" : "work", query, limit: MEMORY_CONTEXT_LIMIT, items });
  const byRef = new Map(items.map((item, index) => [item.ref, rows[index]!]));
  return {
    savedMemories: rows.length,
    matchedQuestion: selection.matchedCount > 0,
    memories: selection.selected.flatMap(({ ref, matched }) => {
      const row = byRef.get(ref);
      return row ? [{ text: row.content, writtenOn: localDateAt(owner.timeZone, row.recordedAt), aboutThisQuestion: matched }] : [];
    }),
  };
}

export function memoryErrorResponse(error: unknown) {
  if (error instanceof MemoryError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  return null;
}
