/**
 * User-facing wording for authentication outcomes Better Auth reports as codes.
 *
 * `authRedirectMessage` reads the `error` query parameter Better Auth adds
 * when it redirects back to an auth page: a failed verification link
 * (`/verify-email`, upper-case codes) or a failed social sign-in (the OAuth
 * callback, lower-case codes, including the provider's own `access_denied`).
 * Unknown codes get a generic line rather than echoing the parameter, which
 * anyone can put in a URL.
 */

export const EMAIL_NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";

const VERIFICATION_LINK_MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED: "That verification link has expired. Sign in and we'll send you a new one.",
  INVALID_TOKEN: "That verification link isn't valid. Sign in and we'll send you a new one.",
  USER_NOT_FOUND: "We couldn't find the account for that verification link. Create an account to continue.",
  INVALID_USER: "That verification link belongs to a different account. Sign out, then open the link again.",
};

const SOCIAL_SIGN_IN_MESSAGES: Record<string, string> = {
  // An account with this email exists but isn't verified, so it can't be linked safely.
  account_not_linked: "An account with this email already exists. Sign in with your password once to verify it, then you can use this sign-in option too.",
  email_not_verified: "That account's email isn't verified yet. We've sent a verification link — open it, then sign in again.",
  email_not_found: "That provider didn't share an email address, so we can't sign you in with it. Try another option.",
  access_denied: "Sign-in was cancelled. Choose an option to try again.",
  account_already_linked_to_different_user: "That sign-in is already connected to a different MichaelOS account.",
  state_mismatch: "That sign-in took too long or was opened in another browser. Please try again.",
  please_restart_the_process: "That sign-in took too long or was opened in another browser. Please try again.",
};

export function authRedirectMessage(code: string | undefined | null) {
  if (!code) return null;
  if (Object.hasOwn(VERIFICATION_LINK_MESSAGES, code)) return VERIFICATION_LINK_MESSAGES[code]!;
  if (Object.hasOwn(SOCIAL_SIGN_IN_MESSAGES, code)) return SOCIAL_SIGN_IN_MESSAGES[code]!;
  return code === code.toUpperCase()
    ? "We couldn't verify your email with that link. Sign in to get a new one."
    : "We couldn't sign you in with that provider. Please try again.";
}

/** Better Auth's client error for a sign-in blocked on an unverified address. */
export function isEmailNotVerifiedError(error: { code?: string; status?: number } | null | undefined) {
  return error?.code === EMAIL_NOT_VERIFIED_CODE;
}
