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

/**
 * The Neon driver rejects with a DOM-style ErrorEvent, not an Error: its own
 * `message` is empty and the real cause hangs off `.error`. An `instanceof
 * Error` check alone therefore reports nothing useful.
 */
/** The first stack frame, trimmed to the part that identifies the origin. */
function originFrame(stack: unknown): string | undefined {
  if (typeof stack !== "string") return undefined;
  const frame = stack.split("\n").find((line) => line.trim().startsWith("at "))?.trim();
  return frame?.replace(/^at\s+/, "").replace(`${process.cwd()}/`, "") || undefined;
}

function describeError(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<object>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || value === null || value === undefined) return;
    if (typeof value !== "object") {
      const text = String(value).trim();
      if (text) parts.push(text);
      return;
    }
    if (seen.has(value)) return;
    seen.add(value);

    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : value.constructor?.name;
    const code = typeof record.code === "string" ? record.code : undefined;
    const message = typeof record.message === "string" ? record.message.trim() : "";
    // Driver errors routinely arrive with an empty message; the origin frame is
    // then the only thing that identifies what actually failed.
    const origin = message ? undefined : originFrame(record.stack);
    const descriptor = [name, code && `(${code})`, message, origin && `thrown at ${origin}`]
      .filter(Boolean)
      .join(" ");
    if (descriptor) parts.push(descriptor);
    if (typeof record.clientVersion === "string") parts.push(`Prisma client ${record.clientVersion}`);

    visit(record.error, depth + 1);
    visit(record.cause, depth + 1);
    if (Array.isArray(record.errors)) for (const nested of record.errors) visit(nested, depth + 1);
  };

  visit(error, 0);
  return parts.length ? parts.join(" <- ") : `Unrecognized rejection of type ${typeof error}`;
}

main().catch((error: unknown) => {
  // Report the real error, but never leak a connection string.
  const detail = describeError(error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted database URL]");
  console.error(`Database check failed: ${detail}`);
  process.exitCode = 1;
});
