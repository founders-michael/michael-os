import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to connect to the database.");
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClientSchemaRevision?: string;
};

// Regenerating Prisma after a schema change does not replace the client
// instance held on globalThis during Next dev HMR. Bump this revision when a
// schema change adds/removes models so stale instances are not reused.
const prismaClientSchemaRevision = "20261111-ai-conversations-v1";

if (
  process.env.NODE_ENV !== "production" &&
  globalForPrisma.prisma &&
  globalForPrisma.prismaClientSchemaRevision !== prismaClientSchemaRevision
) {
  const staleClient = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  void staleClient.$disconnect().catch(() => {
    console.warn("[prisma] Could not disconnect a stale development client after schema regeneration.");
  });
}

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClientSchemaRevision = prismaClientSchemaRevision;
}
