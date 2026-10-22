import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters.");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL must be set to the application's base URL.");
}

export const auth = betterAuth({
  appName: "MichaelOS",
  secret,
  baseURL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
});
