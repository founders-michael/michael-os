import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local automatically; Prisma CLI does not.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prefer Neon's direct URL for CLI migrations. The pooled app URL is a
    // fallback so validation and local setup still work before it is added.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
