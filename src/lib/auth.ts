import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { meetsPasswordPolicy } from "@/lib/password-policy";
import { NEW_USER_PRODUCT_PERMISSIONS } from "@/lib/product-permission-policy";
import { assertAccountCanBeDeleted, purgeDeletedAccountCache } from "@/lib/account-deletion";
import { sendEmail } from "@/lib/email-sender";
import { buildVerificationEmail, EMAIL_VERIFICATION_EXPIRES_SECONDS } from "@/lib/verification-email";
import { googleNativeClientIds, socialProviderCredentials } from "@/lib/social-providers";
import { githubAvatarFromProfile, pictureFromGoogleIdToken } from "@/lib/provider-avatar";

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;

if (!secret || secret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters.");
}

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL must be set to the application's base URL.");
}

const social = socialProviderCredentials(process.env);
const nativeGoogleClientIds = googleNativeClientIds(process.env);

type LinkedAccount = { userId?: unknown; providerId?: unknown; idToken?: unknown; accessToken?: unknown };

/**
 * Fills `User.image` from Google or GitHub when it is empty. Better Auth sets
 * it only when a social sign-in creates the user, so an account linked to an
 * existing password user had no picture. Runs after an account is linked and
 * after each social sign-in refreshes its tokens (which also repairs accounts
 * linked before this existed). The write is conditional on `image` being
 * null, so it never replaces a picture; the user's upload lives elsewhere
 * (`UserProfileImage`) and the name is never touched. Failure is logged and
 * ignored: a missing picture must never block a sign-in.
 */
async function fillProviderImage(account: LinkedAccount) {
  try {
    if (typeof account.userId !== "string") return;
    const user = await prisma.user.findUnique({ where: { id: account.userId }, select: { image: true } });
    if (!user || user.image) return;
    let image: string | null = null;
    if (account.providerId === "google" && typeof account.idToken === "string") {
      image = pictureFromGoogleIdToken(account.idToken);
    } else if (account.providerId === "github" && typeof account.accessToken === "string") {
      const response = await fetch("https://api.github.com/user", {
        headers: { authorization: `Bearer ${account.accessToken}`, accept: "application/vnd.github+json", "user-agent": "MichaelOS" },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) image = githubAvatarFromProfile(await response.json());
    }
    if (image) await prisma.user.updateMany({ where: { id: account.userId, image: null }, data: { image } });
  } catch {
    console.error("[auth] Could not copy the provider's profile picture.");
  }
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
    ...(social.google ? {
      google: {
        ...social.google,
        // The web ID stays first: the redirect flow uses the first entry. The
        // native IDs only extend which ID-token audiences are accepted.
        clientId: nativeGoogleClientIds.length > 0 ? [social.google.clientId, ...nativeGoogleClientIds] : social.google.clientId,
        prompt: "select_account" as const,
        requireEmailVerification: true,
      },
    } : {}),
    ...(social.github ? { github: { ...social.github, requireEmailVerification: true } } : {}),
  },
  // Account deletion, which both app stores require. `POST /api/auth/delete-user`
  // needs the password, or a session fresh enough to prove the person is
  // present, and then removes the user row; every personal table cascades from
  // it. Nothing is soft-deleted: the promise made to the user is that the data
  // is gone.
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => { await assertAccountCanBeDeleted(user.id); },
      afterDelete: async (user) => { await purgeDeletedAccountCache(user.id); },
    },
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
  // The native apps cannot hold a cookie jar the way a browser does. With this
  // plugin a sign-in also returns the session token in `set-auth-token`, and a
  // request carrying `Authorization: Bearer <token>` resolves to the same
  // session a cookie would. Tokens must be signed, so a guessed or truncated
  // value is never looked up.
  plugins: [bearer({ requireSignature: true })],
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
    account: {
      create: { after: async (account) => { await fillProviderImage(account); } },
      update: { after: async (account) => { await fillProviderImage(account); } },
    },
  },
});
