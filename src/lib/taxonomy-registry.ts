/**
 * The universal data taxonomy (CLAUDE.md §10.4): a controlled catalog of
 * categories that existing records can be classified into.
 *
 * Source of truth: `shared/taxonomy/registry.json`, read by this app and by
 * services/intelligence. It reaches the database only through a migration
 * generated from it (`npx tsx scripts/taxonomy-migration.ts`), so every
 * environment's `TaxonomyCategory` table is exactly the reviewed file. A model
 * never creates a category; it may only choose a registered key.
 *
 * Logical levels: namespace (1) → domain (2) → subdomain (3) → entity/event (4)
 * → attribute (5). Levels 1–3 are rows; levels 4–5 are the existing models and
 * their fields. Pure, so it is unit-tested.
 */
import registryFile from "../../shared/taxonomy/registry.json";

export const NAMESPACES = ["core", "personal", "work", "industry", "intelligence", "platform"] as const;
export const SENSITIVITIES = ["STANDARD", "PERSONAL", "SENSITIVE"] as const;
export const PURPOSES = ["ASSISTANT_CONTEXT", "PLANNING", "INSIGHTS", "ORGANIZATION_REPORTING"] as const;
export const RETENTION_POLICIES = ["FOLLOWS_RECORD"] as const;
export const PERSONAL_ENTITY_TYPES = ["TASK", "GOAL", "HABIT", "CALENDAR_EVENT"] as const;
export const WORK_ENTITY_TYPES = ["WORK_TASK", "PROJECT"] as const;
export const ENTITY_TYPES = [...PERSONAL_ENTITY_TYPES, ...WORK_ENTITY_TYPES] as const;

export type TaxonomyNamespace = (typeof NAMESPACES)[number];
export type ClassifiableEntityType = (typeof ENTITY_TYPES)[number];
export type TaxonomyCategoryDefinition = {
  key: string;
  namespace: TaxonomyNamespace;
  parent: string | null;
  name: string;
  description: string;
  sensitivity: (typeof SENSITIVITIES)[number];
  permittedPurposes: (typeof PURPOSES)[number][];
  retention: (typeof RETENTION_POLICIES)[number];
  entityTypes: ClassifiableEntityType[];
  status: "ACTIVE" | "DEPRECATED";
};
export type TaxonomyRegistry = {
  schemaVersion: 1;
  registryVersion: number;
  namespaces: { key: TaxonomyNamespace; name: string; description: string }[];
  homes: Record<ClassifiableEntityType, string | null>;
  categories: TaxonomyCategoryDefinition[];
};

export const taxonomyRegistry = registryFile as TaxonomyRegistry;

const KEY_PATTERN = /^[a-z]+(\.[a-z][a-z_]*){1,2}$/;

export function categoryLevel(key: string) {
  return key.split(".").length;
}

/** Which records a namespace's categories may classify: personal records stay personal, work stays work. */
export function entityTypesForNamespace(namespace: TaxonomyNamespace): readonly ClassifiableEntityType[] {
  if (namespace === "personal") return PERSONAL_ENTITY_TYPES;
  if (namespace === "work" || namespace === "industry") return WORK_ENTITY_TYPES;
  return [];
}

export function isPersonalEntityType(type: ClassifiableEntityType) {
  return (PERSONAL_ENTITY_TYPES as readonly string[]).includes(type);
}

/** Every rule the registry must satisfy. Returns the problems; empty means valid. */
export function validateRegistry(registry: TaxonomyRegistry): string[] {
  const problems: string[] = [];
  if (registry.schemaVersion !== 1) problems.push("schemaVersion must be 1");
  if (!Number.isInteger(registry.registryVersion) || registry.registryVersion < 1) problems.push("registryVersion must be a positive integer");
  const namespaceKeys = registry.namespaces.map(({ key }) => key);
  if (JSON.stringify([...namespaceKeys].sort()) !== JSON.stringify([...NAMESPACES].sort())) problems.push("namespaces must be exactly the six master namespaces");

  const byKey = new Map<string, TaxonomyCategoryDefinition>();
  for (const category of registry.categories) {
    const where = `category ${category.key}`;
    if (!KEY_PATTERN.test(category.key)) { problems.push(`${where}: key must be namespace.domain or namespace.domain.subdomain in lower_snake_case`); continue; }
    if (byKey.has(category.key)) problems.push(`${where}: duplicate key`);
    byKey.set(category.key, category);
    if (!NAMESPACES.includes(category.namespace) || category.key.split(".")[0] !== category.namespace) problems.push(`${where}: namespace must match the key's first part`);
    if (category.namespace === "core") problems.push(`${where}: core holds entities, not categories`);
    if (!category.name || category.name.length > 120) problems.push(`${where}: name must be 1–120 characters`);
    if (!category.description || category.description.length > 500) problems.push(`${where}: description must be 1–500 characters`);
    if (!SENSITIVITIES.includes(category.sensitivity)) problems.push(`${where}: unknown sensitivity`);
    if (!RETENTION_POLICIES.includes(category.retention)) problems.push(`${where}: unknown retention policy`);
    if (category.status !== "ACTIVE" && category.status !== "DEPRECATED") problems.push(`${where}: unknown status`);
    if (new Set(category.permittedPurposes).size !== category.permittedPurposes.length || category.permittedPurposes.some((purpose) => !PURPOSES.includes(purpose))) problems.push(`${where}: purposes must be known and unique`);
    // Sensitive data never enters a model's context by default; it is opt-in by purpose later.
    if (category.sensitivity === "SENSITIVE" && category.permittedPurposes.includes("ASSISTANT_CONTEXT")) problems.push(`${where}: sensitive categories may not permit ASSISTANT_CONTEXT`);
    if (category.permittedPurposes.includes("ORGANIZATION_REPORTING") && category.namespace === "personal") problems.push(`${where}: personal data is never reported to an organization`);
    const allowed = entityTypesForNamespace(category.namespace);
    if (new Set(category.entityTypes).size !== category.entityTypes.length || category.entityTypes.some((type) => !allowed.includes(type))) problems.push(`${where}: entity types must be unique and belong to the namespace's product`);
    if (categoryLevel(category.key) === 2 && category.parent !== null) problems.push(`${where}: a domain has no parent`);
  }
  for (const category of registry.categories) {
    if (categoryLevel(category.key) !== 3) continue;
    const expectedParent = category.key.split(".").slice(0, 2).join(".");
    const parent = byKey.get(expectedParent);
    if (category.parent !== expectedParent || !parent) { problems.push(`category ${category.key}: parent must be ${expectedParent}`); continue; }
    if (category.entityTypes.some((type) => !parent.entityTypes.includes(type))) problems.push(`category ${category.key}: entity types must be a subset of the parent's`);
    if (parent.status === "DEPRECATED" && category.status === "ACTIVE") problems.push(`category ${category.key}: an active subdomain needs an active parent`);
  }
  for (const type of ENTITY_TYPES) {
    if (!(type in registry.homes)) { problems.push(`homes: missing ${type}`); continue; }
    const home = registry.homes[type];
    if (home === null) continue;
    const category = byKey.get(home);
    if (!category || category.status !== "ACTIVE" || !category.entityTypes.includes(type)) problems.push(`homes: ${type} must point at an active category that accepts it`);
  }
  return problems;
}

/** The categories a product's records may be classified into. */
export function activeCategoriesFor(registry: TaxonomyRegistry, product: "lifestyle" | "work") {
  const namespaces: TaxonomyNamespace[] = product === "lifestyle" ? ["personal"] : ["work", "industry"];
  return registry.categories.filter((category) => category.status === "ACTIVE" && namespaces.includes(category.namespace));
}

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlEnumArray(values: readonly string[], type: string) {
  return values.length ? `ARRAY[${values.map(sqlText).join(", ")}]::"${type}"[]` : `ARRAY[]::"${type}"[]`;
}

/**
 * The migration that makes the database's catalog equal to the registry.
 * Upserts every category (domains before their subdomains); a key no longer in
 * the file is marked DEPRECATED, never deleted, because classifications may
 * still point at it.
 */
export function registryMigrationSql(registry: TaxonomyRegistry) {
  const ordered = [...registry.categories].sort((a, b) => categoryLevel(a.key) - categoryLevel(b.key) || a.key.localeCompare(b.key));
  const rows = ordered.map((category) => `  (${[
    sqlText(category.key),
    `${sqlText(category.namespace.toUpperCase())}::"TaxonomyNamespace"`,
    String(categoryLevel(category.key)),
    category.parent ? sqlText(category.parent) : "NULL",
    sqlText(category.name),
    sqlText(category.description),
    `${sqlText(category.sensitivity)}::"DataSensitivity"`,
    sqlEnumArray(category.permittedPurposes, "DataPurpose"),
    `${sqlText(category.retention)}::"RetentionPolicy"`,
    sqlEnumArray(category.entityTypes, "ClassifiableEntityType"),
    `${sqlText(category.status)}::"TaxonomyStatus"`,
    String(registry.schemaVersion),
    String(registry.registryVersion),
  ].join(", ")})`);
  return [
    `-- Taxonomy registry version ${registry.registryVersion}.`,
    "-- Generated from shared/taxonomy/registry.json by scripts/taxonomy-migration.ts. Do not edit by hand.",
    "",
    `INSERT INTO "TaxonomyCategory" ("key", "namespace", "level", "parentKey", "name", "description", "sensitivity", "permittedPurposes", "retention", "entityTypes", "status", "schemaVersion", "registryVersion", "updatedAt") VALUES`,
    rows.map((row) => row.replace(/\)$/, ", CURRENT_TIMESTAMP)")).join(",\n"),
    `ON CONFLICT ("key") DO UPDATE SET`,
    `  "namespace" = EXCLUDED."namespace", "level" = EXCLUDED."level", "parentKey" = EXCLUDED."parentKey", "name" = EXCLUDED."name",`,
    `  "description" = EXCLUDED."description", "sensitivity" = EXCLUDED."sensitivity", "permittedPurposes" = EXCLUDED."permittedPurposes",`,
    `  "retention" = EXCLUDED."retention", "entityTypes" = EXCLUDED."entityTypes", "status" = EXCLUDED."status",`,
    `  "schemaVersion" = EXCLUDED."schemaVersion", "registryVersion" = EXCLUDED."registryVersion", "updatedAt" = CURRENT_TIMESTAMP;`,
    "",
    `UPDATE "TaxonomyCategory" SET "status" = 'DEPRECATED', "updatedAt" = CURRENT_TIMESTAMP`,
    `WHERE "key" NOT IN (${ordered.map((category) => sqlText(category.key)).join(", ")}) AND "status" <> 'DEPRECATED';`,
    "",
  ].join("\n");
}
