import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { MAX_DEPENDENCY_DEPTH } from "@/lib/dependency-analysis-model";

/**
 * The ONE dependency-graph traversal in this codebase. Both the write-path
 * cycle guard (work-task-service.ts addWorkTaskDependency) and the read-path
 * analysis (dependency-analysis-service.ts) call it, so the graph is never
 * walked by two different queries that could disagree.
 *
 * Edge semantics: WorkTaskDependency(taskId = T, dependsOnTaskId = D) means
 * "T depends on D", so D blocks T.
 *   - "upstream"   from T yields T's blockers (its ancestors).
 *   - "downstream" from T yields the tasks T blocks (its descendants).
 *
 * Rows are deduplicated on (seedTaskId, taskId, depth), so the result is
 * bounded by seeds x nodes x maxDepth and cannot blow up on a dense graph.
 * Longest-path and critical-path work happens in dependency-analysis-model.ts
 * over this bounded closure plus its edges, never by enumerating paths in SQL.
 */
export { MAX_DEPENDENCY_DEPTH } from "@/lib/dependency-analysis-model";

export type GraphDirection = "upstream" | "downstream";

export type ClosureRow = { seedTaskId: string; taskId: string; depth: number };

/** The recursive CTE. Column roles swap with the direction; nothing else does. */
function closureSql(organizationId: string, seedTaskIds: string[], direction: GraphDirection, maxDepth: number) {
  // Column names come from a closed union, never from user input.
  const fromColumn = Prisma.raw(direction === "upstream" ? `"taskId"` : `"dependsOnTaskId"`);
  const toColumn = Prisma.raw(direction === "upstream" ? `"dependsOnTaskId"` : `"taskId"`);
  return Prisma.sql`
    WITH RECURSIVE closure("seedTaskId", "taskId", depth) AS (
      SELECT seed.${fromColumn} AS "seedTaskId", seed.${toColumn} AS "taskId", 1 AS depth
      FROM "WorkTaskDependency" AS seed
      WHERE seed."organizationId" = ${organizationId}
        AND seed.${fromColumn} = ANY(${seedTaskIds}::text[])
      UNION
      SELECT walked."seedTaskId", edge.${toColumn}, walked.depth + 1
      FROM "WorkTaskDependency" AS edge
      INNER JOIN closure AS walked ON edge.${fromColumn} = walked."taskId"
      WHERE edge."organizationId" = ${organizationId}
        -- The depth cap terminates any cycle that reached the table despite the
        -- write-path guard, so the walk can never loop.
        AND walked.depth < ${maxDepth}
    )
  `;
}

type Client = Pick<Prisma.TransactionClient, "$queryRaw">;

/** Full closure rows for analysis. */
export async function fetchDependencyClosure(
  client: Client,
  options: { organizationId: string; seedTaskIds: string[]; direction: GraphDirection; maxDepth?: number },
): Promise<ClosureRow[]> {
  if (options.seedTaskIds.length === 0) return [];
  const maxDepth = options.maxDepth ?? MAX_DEPENDENCY_DEPTH;
  const rows = await client.$queryRaw<Array<{ seedTaskId: string; taskId: string; depth: number }>>(Prisma.sql`
    ${closureSql(options.organizationId, options.seedTaskIds, options.direction, maxDepth)}
    SELECT "seedTaskId", "taskId", depth::int AS depth FROM closure
    ORDER BY "seedTaskId", depth, "taskId"
  `);
  return rows.map((row) => ({ seedTaskId: row.seedTaskId, taskId: row.taskId, depth: Number(row.depth) }));
}

/**
 * Whether `candidateTaskId` is reachable from the seed. This is the cycle
 * guard: adding "T depends on D" creates a cycle exactly when T is already
 * upstream of D. Same traversal as the analysis, reduced to one boolean.
 */
export async function closureContains(
  client: Client,
  options: { organizationId: string; seedTaskIds: string[]; direction: GraphDirection; maxDepth?: number },
  candidateTaskId: string,
): Promise<boolean> {
  if (options.seedTaskIds.length === 0) return false;
  const maxDepth = options.maxDepth ?? MAX_DEPENDENCY_DEPTH;
  const rows = await client.$queryRaw<Array<{ reachable: boolean }>>(Prisma.sql`
    ${closureSql(options.organizationId, options.seedTaskIds, options.direction, maxDepth)}
    SELECT EXISTS (SELECT 1 FROM closure WHERE "taskId" = ${candidateTaskId}) AS reachable
  `);
  return rows[0]?.reachable === true;
}

/** Edges among a known node set, for weighted longest-path work in the model. */
export async function fetchDependencyEdges(
  client: Client,
  organizationId: string,
  taskIds: string[],
): Promise<Array<{ taskId: string; dependsOnTaskId: string; createdAt: Date }>> {
  if (taskIds.length === 0) return [];
  return client.$queryRaw<Array<{ taskId: string; dependsOnTaskId: string; createdAt: Date }>>(Prisma.sql`
    SELECT "taskId", "dependsOnTaskId", "createdAt"
    FROM "WorkTaskDependency"
    WHERE "organizationId" = ${organizationId}
      AND "taskId" = ANY(${taskIds}::text[])
      AND "dependsOnTaskId" = ANY(${taskIds}::text[])
    ORDER BY "taskId", "dependsOnTaskId"
  `);
}
