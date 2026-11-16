import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "@/lib/prisma";
import { meetsPasswordPolicy } from "@/lib/password-policy";
import { NEW_USER_PRODUCT_PERMISSIONS } from "@/lib/product-permission-policy";
import { sendEmail } from "@/lib/email-sender";
import { buildVerificationEmail, EMAIL_VERIFICATION_EXPIRES_SECONDS } from "@/lib/verification-email";
import { socialProviderCredentials } from "@/lib/social-providers";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters.");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL must be set to the application's base URL.");
}

const social = socialProviderCredentials(process.env);

export const auth = betterAuth({
  appName: "MichaelOS",
  secret,
  baseURL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    // Strict: no session until the address is verified. Sign-up returns no
    // session, and a sign-in with the right password but an unverified
    // address is refused with 403 EMAIL_NOT_VERIFIED after a fresh link is sent.
    requireEmailVerification: true,
  },
  // Social sign-in. Each provider is on only when its id and secret are set.
  // `requireEmailVerification` keeps the strict rule for social accounts too:
  // no session unless the provider reports the email verified (Google's
  // email_verified claim; GitHub's verified flag on the address).
  //
  // Account linking keeps Better Auth's default `requireLocalEmailVerified`:
  // a social sign-in only joins an existing password account whose email is
  // already verified. Otherwise someone could pre-register a victim's address
  // with a password and keep access after the victim signs in with Google.
  // That case redirects back with ?error=account_not_linked.
  socialProviders: {
    ...(social.google ? { google: { ...social.google, prompt: "select_account" as const, requireEmailVerification: true } } : {}),
    ...(social.github ? { github: { ...social.github, requireEmailVerification: true } } : {}),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_VERIFICATION_EXPIRES_SECONDS,
    sendVerificationEmail: async ({ user, url }) => {
      const message = buildVerificationEmail({ name: user.name, url });
      await sendEmail({ to: user.email, ...message, devLink: url });
    },
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
