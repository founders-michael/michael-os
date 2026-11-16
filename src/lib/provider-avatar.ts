/**
 * The sign-in provider's profile picture, for accounts Better Auth links
 * rather than creates.
 *
 * Better Auth copies the provider's picture into `User.image` only when a
 * social sign-in creates a new user. When it links Google or GitHub to an
 * existing (verified) password account, `User.image` stays empty — so the
 * user's Google photo never appeared. `auth.ts` calls `fillProviderImage` from
 * the account hooks to fill it, and only when it is empty: it never replaces a
 * picture or touches the name the user may have edited.
 *
 * Only https URLs on each provider's own image hosts are accepted.
 */

const GOOGLE_IMAGE_HOST = /(^|\.)googleusercontent\.com$/;
const GITHUB_IMAGE_HOST = /^avatars\.githubusercontent\.com$/;

function safeImageUrl(value: unknown, host: RegExp): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && host.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The `picture` claim of a Google ID token. The token is the one Better Auth
 * received from Google's token endpoint and stored; only its picture is read.
 */
export function pictureFromGoogleIdToken(idToken: string | null | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { picture?: unknown };
    return safeImageUrl(claims.picture, GOOGLE_IMAGE_HOST);
  } catch {
    return null;
  }
}

export function githubAvatarFromProfile(profile: unknown): string | null {
  return safeImageUrl((profile as { avatar_url?: unknown } | null)?.avatar_url, GITHUB_IMAGE_HOST);
}
