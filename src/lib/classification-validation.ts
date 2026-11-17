import { z } from "zod";
import { PERSONAL_ENTITY_TYPES, WORK_ENTITY_TYPES } from "@/lib/taxonomy-registry";

const recordId = z.string().trim().min(1).max(128);
const categoryKey = z.string().trim().regex(/^[a-z]+(\.[a-z][a-z_]*){1,2}$/, "Choose a category from the catalog.").max(120);
const page = z.coerce.number().int().min(1).max(10_000).default(1);

export const taxonomyQuerySchema = z.object({
  product: z.enum(["lifestyle", "work"]),
  page,
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

function recordSchemas<const T extends readonly [string, ...string[]]>(types: T) {
  const entityType = z.enum(types);
  return {
    list: z.object({ entityType, entityId: recordId, page, limit: z.coerce.number().int().min(1).max(50).default(20) }).strict(),
    create: z.object({ entityType, entityId: recordId, categoryKey }).strict(),
  };
}

/** LifestyleOS records only: a personal route can never name a work record. */
export const personalClassificationSchemas = recordSchemas(PERSONAL_ENTITY_TYPES);
/** WorkOS records only. */
export const workClassificationSchemas = recordSchemas(WORK_ENTITY_TYPES);

export type PersonalClassificationListInput = z.infer<typeof personalClassificationSchemas.list>;
export type PersonalClassificationCreateInput = z.infer<typeof personalClassificationSchemas.create>;
export type WorkClassificationListInput = z.infer<typeof workClassificationSchemas.list>;
export type WorkClassificationCreateInput = z.infer<typeof workClassificationSchemas.create>;
