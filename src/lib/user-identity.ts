/**
 * Who the user is, as every screen and Michael should show it.
 *
 * The one place that decides the user's name and picture. Pages build an
 * identity on the server with `buildUserIdentity` and the app shell shares it
 * through `UserIdentityProvider`, so a name changed in Settings shows
 * everywhere at once — no component picks a name for itself.
 *
 * Name, in order: the name the user asked Michael to call them, their full
 * name, the part of their email before the @, then a generic word. The
 * picture: an uploaded photo, then the sign-in provider's photo, then initials.
 *
 * Pure (no server imports), so client components can use the types and tests
 * cover the rules.
 */

export type IdentityNameSource = "preferred" | "fullName" | "email" | "generic";

export type IdentityInput = {
  preferredName?: string | null;
  fullName?: string | null;
  email?: string | null;
  /** The sign-in provider's picture (`User.image`). Never overwritten by an upload. */
  providerImage?: string | null;
  /** When the uploaded photo last changed; null when there is none. */
  customImageUpdatedAt?: Date | string | null;
};

/** What the client receives: serializable, and nothing it may not show. */
export type UserIdentity = {
  displayName: string;
  /** How a greeting addresses the user: the preferred name as written, else a first name. */
  greetingName: string;
  nameSource: IdentityNameSource;
  initials: string;
  avatarUrl: string | null;
  avatarSource: "custom" | "provider" | "none";
};

/** The route that serves the signed-in user's own uploaded photo. */
export const PROFILE_IMAGE_PATH = "/api/account/image";

const GENERIC_DISPLAY_NAME = "Your account";
const GENERIC_GREETING_NAME = "there";
const MAX_NAME_LENGTH = 80;

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

function emailUsername(email: string | null | undefined) {
  const local = clean(email).split("@")[0] ?? "";
  return local.slice(0, 40);
}

export function displayNameFor(input: IdentityInput): { name: string; source: IdentityNameSource } {
  const preferred = clean(input.preferredName);
  if (preferred) return { name: preferred, source: "preferred" };
  const full = clean(input.fullName);
  if (full) return { name: full, source: "fullName" };
  const username = emailUsername(input.email);
  if (username) return { name: username, source: "email" };
  return { name: GENERIC_DISPLAY_NAME, source: "generic" };
}

/**
 * The preferred name is used exactly as the user wrote it ("Dr. Rao" stays
 * "Dr. Rao"); a full name is shortened to its first word for a greeting.
 */
export function greetingNameFor(input: IdentityInput) {
  const { name, source } = displayNameFor(input);
  if (source === "preferred" || source === "email") return name;
  if (source === "fullName") return name.split(" ")[0]!;
  return GENERIC_GREETING_NAME;
}

export function initialsFor(name: string) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "U";
}

/** Only an https provider URL is used; anything else falls back to initials. */
function safeProviderImage(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function avatarFor(input: IdentityInput): { url: string | null; source: UserIdentity["avatarSource"] } {
  if (input.customImageUpdatedAt) {
    // The version makes a replaced photo a new URL, so no cache shows the old one.
    const version = new Date(input.customImageUpdatedAt).getTime();
    return { url: `${PROFILE_IMAGE_PATH}?v=${version}`, source: "custom" };
  }
  const provider = safeProviderImage(input.providerImage);
  return provider ? { url: provider, source: "provider" } : { url: null, source: "none" };
}

export function buildUserIdentity(input: IdentityInput): UserIdentity {
  const { name, source } = displayNameFor(input);
  const avatar = avatarFor(input);
  return {
    displayName: name,
    greetingName: greetingNameFor(input),
    nameSource: source,
    initials: initialsFor(source === "generic" ? "" : name),
    avatarUrl: avatar.url,
    avatarSource: avatar.source,
  };
}

/** Sign-in methods as the user knows them. Better Auth calls email and password "credential". */
export const AUTH_PROVIDER_LABELS: Record<string, string> = {
  credential: "Email and password",
  google: "Google",
  github: "GitHub",
};

export function authProviderLabel(providerId: string) {
  return AUTH_PROVIDER_LABELS[providerId] ?? providerId;
}
