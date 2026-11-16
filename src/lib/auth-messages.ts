/**
 * User-facing wording for authentication outcomes Better Auth reports as codes.
 *
 * `verificationLinkMessage` reads the `error` query parameter Better Auth adds
 * when a verification link fails (`/verify-email` redirects to the link's
 * callback with `?error=<CODE>`). Unknown codes get a generic line rather than
 * echoing the parameter, which anyone can put in a URL.
 */

export const EMAIL_NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";

const VERIFICATION_LINK_MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED: "That verification link has expired. Sign in and we'll send you a new one.",
  INVALID_TOKEN: "That verification link isn't valid. Sign in and we'll send you a new one.",
  USER_NOT_FOUND: "We couldn't find the account for that verification link. Create an account to continue.",
  INVALID_USER: "That verification link belongs to a different account. Sign out, then open the link again.",
};

export function verificationLinkMessage(code: string | undefined | null) {
  if (!code) return null;
  return VERIFICATION_LINK_MESSAGES[code] ?? "We couldn't verify your email with that link. Sign in to get a new one.";
}

/** Better Auth's client error for a sign-in blocked on an unverified address. */
export function isEmailNotVerifiedError(error: { code?: string; status?: number } | null | undefined) {
  return error?.code === EMAIL_NOT_VERIFIED_CODE;
}
