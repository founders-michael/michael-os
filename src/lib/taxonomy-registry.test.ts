import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { activeCategoriesFor, categoryLevel, registryMigrationSql, taxonomyRegistry, validateRegistry, type TaxonomyRegistry } from "@/lib/taxonomy-registry";

const clone = (): TaxonomyRegistry => JSON.parse(JSON.stringify(taxonomyRegistry));

test("the shared registry is valid", () => {
  assert.deepEqual(validateRegistry(taxonomyRegistry), []);
});

test("the registry holds the 67 initial domains across the six namespaces", () => {
  const domains = taxonomyRegistry.categories.filter((category) => categoryLevel(category.key) === 2);
  assert.equal(domains.length, 67);
  const count = (namespace: string) => domains.filter((category) => category.namespace === namespace).length;
  assert.deepEqual([count("personal"), count("work"), count("industry"), count("intelligence") + count("platform"), count("core")], [24, 23, 12, 8, 0]);
});

test("the newest taxonomy migration is exactly the registry", () => {
  const directory = readdirSync("prisma/migrations").filter((name) => /_taxonomy_registry_v\d+$/.test(name)).sort().at(-1);
  assert.ok(directory, "no taxonomy migration exists");
  assert.equal(directory.endsWith(`_taxonomy_registry_v${taxonomyRegistry.registryVersion}`), true, "bump registryVersion and run scripts/taxonomy-migration.ts");
  assert.equal(readFileSync(`prisma/migrations/${directory}/migration.sql`, "utf8"), registryMigrationSql(taxonomyRegistry), "the migration is stale; regenerate it");
});

test("invalid categories are rejected", () => {
  const cases: Array<[string, (registry: TaxonomyRegistry) => void, RegExp]> = [
    ["bad key", (r) => { r.categories[0]!.key = "Personal.Identity"; }, /key must be/],
    ["duplicate", (r) => { r.categories.push({ ...r.categories[0]! }); }, /duplicate key/],
    ["namespace mismatch", (r) => { r.categories[0]!.namespace = "work"; }, /namespace must match/],
    ["core category", (r) => { r.categories.push({ ...r.categories[0]!, key: "core.people", namespace: "core", entityTypes: [] }); }, /core holds entities/],
    ["sensitive in model context", (r) => { const c = r.categories.find((x) => x.sensitivity === "SENSITIVE")!; c.permittedPurposes = ["ASSISTANT_CONTEXT"]; }, /may not permit ASSISTANT_CONTEXT/],
    ["personal reported to an organization", (r) => { r.categories[0]!.permittedPurposes = ["ORGANIZATION_REPORTING"]; }, /never reported to an organization/],
    ["work record in a personal category", (r) => { r.categories.find((x) => x.namespace === "personal")!.entityTypes = ["WORK_TASK"]; }, /belong to the namespace's product/],
    ["personal record in a work category", (r) => { r.categories.find((x) => x.namespace === "work")!.entityTypes = ["TASK"]; }, /belong to the namespace's product/],
    ["wrong parent", (r) => { r.categories.find((x) => x.parent)!.parent = "personal.identity"; }, /parent must be/],
    ["orphan subdomain", (r) => { r.categories.push({ ...r.categories.find((x) => x.parent)!, key: "personal.nowhere.thing", parent: "personal.nowhere" }); }, /parent must be personal.nowhere/],
    ["subdomain wider than parent", (r) => { const c = r.categories.find((x) => x.key === "personal.goals.goals")!; c.entityTypes = ["GOAL", "HABIT"]; r.categories.find((x) => x.key === "personal.goals")!.entityTypes = ["GOAL"]; }, /subset of the parent's/],
    ["home on a category that refuses the type", (r) => { r.homes.GOAL = "personal.routines.habits"; }, /GOAL must point/],
    ["missing namespace", (r) => { r.namespaces.pop(); }, /exactly the six/],
  ];
  for (const [name, mutate, expected] of cases) {
    const registry = clone();
    mutate(registry);
    const problems = validateRegistry(registry);
    assert.ok(problems.some((problem) => expected.test(problem)), `${name}: ${problems.join("; ") || "no problem reported"}`);
  }
});

test("each product sees only its own active categories", () => {
  const lifestyle = activeCategoriesFor(taxonomyRegistry, "lifestyle");
  const work = activeCategoriesFor(taxonomyRegistry, "work");
  assert.ok(lifestyle.length > 0 && lifestyle.every((category) => category.namespace === "personal"));
  assert.ok(work.length > 0 && work.every((category) => category.namespace === "work" || category.namespace === "industry"));
  const registry = clone();
  registry.categories.find((category) => category.key === "personal.fitness")!.status = "DEPRECATED";
  assert.equal(activeCategoriesFor(registry, "lifestyle").some((category) => category.key === "personal.fitness"), false);
});

test("migration SQL escapes text and deprecates rather than deletes", () => {
  const registry = clone();
  registry.categories[0]!.description = "It's O'Brien's; DROP TABLE x; --";
  const sql = registryMigrationSql(registry);
  assert.ok(sql.includes("'It''s O''Brien''s; DROP TABLE x; --'"));
  assert.equal(/DELETE/i.test(sql), false);
  assert.match(sql, /SET "status" = 'DEPRECATED'/);
  const domainsFirst = sql.indexOf("'personal.goals'") < sql.indexOf("'personal.goals.goals'");
  assert.ok(domainsFirst, "a domain must be inserted before its subdomains");
});
