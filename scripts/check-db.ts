import dotenv from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Check .env.local locally.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name::text AS table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    console.log(`Database connection: OK (SELECT ${result[0]?.ok ?? "?"})`);
    console.log(`Public tables found: ${tables.length}`);
    if (tables.length > 0) {
      console.log(`Table names: ${tables.map(({ table_name }) => table_name).join(", ")}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown database error";
  // Do not print driver error objects, which can contain connection details.
  console.error(`Database check failed: ${message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted database URL]")}`);
  process.exitCode = 1;
});
