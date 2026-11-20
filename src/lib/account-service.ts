import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildUserIdentity, type UserIdentity } from "@/lib/user-identity";
import type { AccountUpdateInput, PersonalContextUpdateInput } from "@/lib/account-validation";
import type { ProfileImageType } from "@/lib/profile-image";

/**
 * Account details, the uploaded profile photo and the user's personal context.
 *
 * Every function takes the user id the route resolved from the session and
 * scopes each read and write to it; there is no parameter through which one
 * user could name another. Reads here are single primary-key lookups, so they
 * are not cached: a name or photo saved in Settings must show on the very
 * next request.
 */

export class AccountError extends Error {
  constructor(public readonly status: 400 | 404 | 409, public readonly code: string, message: string) {
    super(message);
    this.name = "AccountError";
  }
}

const serializable = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

function isSerializationConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("40001") || message.includes("could not serialize access") || message.includes("TransactionWriteConflict");
}

/**
 * Serializable, retried up to three times on a lost race, so the loser
 * re-reads and fails on its own guard (a 409) instead of surfacing as a 500.
 * A unique violation can only be two first saves racing; it means the same.
 */
async function withSerializableAccountTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, onConflict: () => never): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, serializable);
    } catch (error) {
      if (error instanceof AccountError) throw error;
      if (isSerializationConflict(error) && attempt < 2) continue;
      if (isSerializationConflict(error)) onConflict();
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") onConflict();
      throw error;
    }
  }
  onConflict();
}

const identitySelect = {
  name: true,
  email: true,
  image: true,
  profile: { select: { preferredName: true } },
  profileImage: { select: { updatedAt: true } },
  accounts: { select: { providerId: true }, orderBy: { createdAt: "asc" } },
} as const;

type IdentityRow = Prisma.UserGetPayload<{ select: typeof identitySelect }>;

export type AccountDto = {
  fullName: string;
  email: string;
  preferredName: string;
  /** Sign-in methods linked to this account, oldest first: "credential", "google", "github". */
  providers: string[];
  hasCustomImage: boolean;
  hasProviderImage: boolean;
  identity: UserIdentity;
};

function toAccountDto(row: IdentityRow): AccountDto {
  const identity = buildUserIdentity({
    preferredName: row.profile?.preferredName,
    fullName: row.name,
    email: row.email,
    providerImage: row.image,
    customImageUpdatedAt: row.profileImage?.updatedAt ?? null,
  });
  return {
    fullName: row.name,
    email: row.email,
    preferredName: row.profile?.preferredName ?? "",
    providers: [...new Set(row.accounts.map((account) => account.providerId))],
    hasCustomImage: Boolean(row.profileImage),
    hasProviderImage: buildUserIdentity({ providerImage: row.image }).avatarSource === "provider",
    identity,
  };
}

export async function getAccount(userId: string): Promise<AccountDto> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: identitySelect });
  if (!row) throw new AccountError(404, "ACCOUNT_NOT_FOUND", "We couldn't find your account.");
  return toAccountDto(row);
}

export type SignInMethod = "password" | "google" | "github";
export type AccountDeletionStatus = {
  /** How this person can prove it is them before deleting: their password, or signing in again with a provider. */
  signInMethods: SignInMethod[];
  /** An account that has ever joined an organization cannot be deleted in the app yet (docs/account-deletion.md). */
  blockedByOrganization: boolean;
};

/** What the Delete account section needs to know. Two small counts scoped to this user. */
export async function getAccountDeletionStatus(userId: string): Promise<AccountDeletionStatus> {
  const [accounts, memberships] = await Promise.all([
    prisma.account.findMany({ where: { userId }, select: { providerId: true, password: true } }),
    prisma.organizationMembership.count({ where: { userId } }),
  ]);
  const methods = new Set<SignInMethod>();
  for (const account of accounts) {
    if (account.providerId === "credential" && account.password) methods.add("password");
    if (account.providerId === "google" || account.providerId === "github") methods.add(account.providerId);
  }
  return { signInMethods: [...methods], blockedByOrganization: memberships > 0 };
}

/** The identity every screen shows. One query; see `user-identity.ts` for the rules. */
export async function getUserIdentity(userId: string): Promise<UserIdentity> {
  return (await getAccount(userId)).identity;
}

/**
 * Full name lives on the auth user, the preferred name on the profile; both
 * change together or not at all. The profile is read scoped to this user
 * first, and a user who has not finished onboarding has none to update.
 */
export async function updateAccount(userId: string, input: AccountUpdateInput): Promise<AccountDto> {
  return withSerializableAccountTransaction(async (tx) => {
    const profile = await tx.userProfile.findUnique({ where: { userId }, select: { userId: true } });
    if (!profile) throw new AccountError(409, "PROFILE_REQUIRED", "Finish setting up LifestyleOS before changing these details.");
    await tx.user.update({ where: { id: userId }, data: { name: input.fullName } });
    await tx.userProfile.update({ where: { userId: profile.userId }, data: { preferredName: input.preferredName } });
    const row = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: identitySelect });
    return toAccountDto(row);
  }, () => { throw new AccountError(409, "ACCOUNT_CHANGED", "Your details changed somewhere else. Reload and try again."); });
}

export async function getProfileImage(userId: string) {
  return prisma.userProfileImage.findUnique({ where: { userId }, select: { contentType: true, data: true, updatedAt: true } });
}

/** Replaces any earlier upload. The provider's `User.image` is never touched. */
export async function saveProfileImage(userId: string, bytes: Uint8Array<ArrayBuffer>, contentType: ProfileImageType): Promise<AccountDto> {
  await prisma.userProfileImage.upsert({
    where: { userId },
    create: { userId, contentType, data: bytes, byteSize: bytes.byteLength },
    update: { contentType, data: bytes, byteSize: bytes.byteLength },
  });
  return getAccount(userId);
}

/** Removing the upload falls back to the provider's picture, or initials. Idempotent. */
export async function removeProfileImage(userId: string): Promise<AccountDto> {
  await prisma.userProfileImage.deleteMany({ where: { userId } });
  return getAccount(userId);
}

export type PersonalContextDto = {
  summary: string;
  /** Null until the user first saves. */
  updatedAt: string | null;
};

export async function getPersonalContext(userId: string): Promise<PersonalContextDto> {
  const row = await prisma.userContext.findUnique({ where: { userId }, select: { summary: true, updatedAt: true } });
  return { summary: row?.summary ?? "", updatedAt: row?.updatedAt.toISOString() ?? null };
}

/**
 * Saves the user's own words, but only over the version they were editing:
 * if it changed since (another tab or device), the save is refused with 409
 * so neither copy is silently lost. This is the only writer of the context;
 * nothing generated may call it.
 */
export async function savePersonalContext(userId: string, input: PersonalContextUpdateInput): Promise<PersonalContextDto> {
  return withSerializableAccountTransaction(async (tx) => {
    const current = await tx.userContext.findUnique({ where: { userId }, select: { updatedAt: true } });
    const currentVersion = current?.updatedAt.toISOString() ?? null;
    const expected = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt).toISOString() : null;
    if (currentVersion !== expected) throw new AccountError(409, "CONTEXT_CHANGED", "Your context was changed somewhere else since you opened it. Copy your text, reload, and try again.");
    const saved = await tx.userContext.upsert({
      where: { userId },
      create: { userId, summary: input.summary },
      update: { summary: input.summary },
      select: { summary: true, updatedAt: true },
    });
    return { summary: saved.summary, updatedAt: saved.updatedAt.toISOString() };
  }, () => { throw new AccountError(409, "CONTEXT_CHANGED", "Your context was changed somewhere else since you opened it. Copy your text, reload, and try again."); });
}

/** For routes: the user-facing error, never internal detail. */
export function accountErrorResponse(error: unknown, logTag: string) {
  if (error instanceof AccountError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(`[${logTag}] Request failed.`);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
