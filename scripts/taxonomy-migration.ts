/**
 * Writes the migration that brings the database's taxonomy catalog to
 * shared/taxonomy/registry.json. Run after a reviewed change to the registry
 * (bump registryVersion first):
 *
 *   npx tsx scripts/taxonomy-migration.ts
 *
 * Then apply it like any migration. The unit test fails until the newest
 * taxonomy migration matches the registry.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { registryMigrationSql, taxonomyRegistry, validateRegistry } from "../src/lib/taxonomy-registry";

const problems = validateRegistry(taxonomyRegistry);
if (problems.length) {
  console.error(`The registry is invalid:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const directory = `prisma/migrations/${stamp}_taxonomy_registry_v${taxonomyRegistry.registryVersion}`;
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/migration.sql`, registryMigrationSql(taxonomyRegistry));
console.log(`Wrote ${directory}/migration.sql`);
