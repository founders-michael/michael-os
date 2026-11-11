import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "@/lib/prisma";
import { meetsPasswordPolicy } from "@/lib/password-policy";
import { NEW_USER_PRODUCT_PERMISSIONS } from "@/lib/product-permission-policy";

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
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const password = ctx.body?.password;
      if (typeof password !== "string" || !meetsPasswordPolicy(password)) {
        throw new APIError("BAD_REQUEST", {
          message: "Password must be 12–128 characters and include an uppercase and a lowercase letter.",
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Default access is provisioned server-side; the registration flow
          // never accepts product permissions from the client.
          await prisma.userProductPermission.createMany({
            data: NEW_USER_PRODUCT_PERMISSIONS.map((permission) => ({ userId: user.id, permission })),
            skipDuplicates: true,
          });
        },
      },
    },
  },
});
