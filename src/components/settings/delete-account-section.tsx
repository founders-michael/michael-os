"use client";

/**
 * Delete account: the in-app deletion both app stores require, on the web.
 *
 * It calls Better Auth's `POST /api/auth/delete-user`, the same endpoint the
 * mobile apps use. The server removes the user row and every personal table
 * cascades from it (docs/account-deletion.md); nothing is soft-deleted, so the
 * screen promises exactly that and nothing more.
 *
 * Proving it is you: a password account types its password. An account that
 * signs in only with Google or GitHub signs in again with it — the server then
 * accepts the deletion because the session is fresh — and comes back here with
 * `?confirmDelete=1`. Either way the person also types DELETE, so the action is
 * never one stray click. Nothing is optimistic (CLAUDE.md §9.5): the screen
 * leaves only after the server confirms the account is gone.
 */
import { useId, useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { AccountDeletionStatus, SignInMethod } from "@/lib/account-service";

const CONFIRM_WORD = "DELETE";
const SUPPORT_EMAIL = "support@michaelos.com";
const PROVIDER_LABEL: Record<Exclude<SignInMethod, "password">, string> = { google: "Google", github: "GitHub" };

/** What is deleted, in the words the store guidelines ask for: specific, and with nothing hidden. */
const DELETED = [
  "Your profile, photo, name and sign-in methods",
  "Every task, goal, milestone, habit and check-in, with their history",
  "Your calendar events, availability and planned sessions",
  "Daily Reviews",
  "Conversations with Michael, your memories and My Context",
  "Categories, task–goal links and how you responded to Michael's suggestions",
];

function messageFor(code: string | undefined, fallback: string | undefined) {
  switch (code) {
    case "INVALID_PASSWORD": return "That password isn't right. Nothing was deleted.";
    case "CREDENTIAL_ACCOUNT_NOT_FOUND": return "This account has no password. Confirm by signing in again instead.";
    case "SESSION_EXPIRED": return "For your security, sign in again to confirm it's you. Nothing was deleted.";
    case "ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION": return `This account belongs to an organization, so it can't be deleted here yet. Email ${SUPPORT_EMAIL} and we'll delete it for you.`;
    default: return fallback || "We couldn't delete your account. Nothing was deleted. Please try again.";
  }
}

export default function DeleteAccountSection({ status, email, reconfirmed }: { status: AccountDeletionStatus; email: string; reconfirmed: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(reconfirmed);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"" | "delete" | "reauth">("");
  const [error, setError] = useState("");
  const [needsReauth, setNeedsReauth] = useState(false);

  const hasPassword = status.signInMethods.includes("password");
  const providers = status.signInMethods.filter((method): method is Exclude<SignInMethod, "password"> => method !== "password");
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;
  const canDelete = confirmed && (!hasPassword || password.length > 0) && !busy;

  async function deleteAccount() {
    if (!canDelete) return;
    setBusy("delete"); setError("");
    try {
      const result = await authClient.deleteUser(hasPassword ? { password } : {});
      if (result.error) {
        const code = result.error.code;
        if (code === "SESSION_EXPIRED") setNeedsReauth(true);
        setError(messageFor(code, result.error.message));
        return;
      }
      // A full page load on purpose, not router.push: it drops every in-memory cache
      // (React Query, the shared identity) still holding the deleted account's data.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/account-deleted");
    } catch {
      setError("We couldn't reach MichaelOS. Check your connection. Nothing was deleted.");
    } finally {
      setBusy("");
    }
  }

  async function signInAgain(provider: Exclude<SignInMethod, "password">) {
    setBusy("reauth"); setError("");
    try {
      await authClient.signIn.social({ provider, callbackURL: "/settings?confirmDelete=1", errorCallbackURL: "/settings" });
    } catch {
      setError("We couldn't open the sign-in page. Please try again.");
      setBusy("");
    }
  }

  return <section className="settings-section m-delete-account" aria-labelledby={`${id}-heading`}>
    <div className="settings-section-heading">
      <span className="settings-section-icon m-delete-account-icon"><Trash2 size={17} aria-hidden="true" /></span>
      <div><h2 id={`${id}-heading`}>Delete account</h2><p>Permanently delete your MichaelOS account and everything in it.</p></div>
    </div>

    {status.blockedByOrganization ? <div className="m-delete-account-blocked" role="note">
      <p>This account belongs to an organization in WorkOS, so it can&apos;t be deleted here yet: the organization&apos;s records still refer to you.</p>
      <p>Email <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Delete my MichaelOS account")}`}>{SUPPORT_EMAIL}</a> from {email} and we&apos;ll delete it for you.</p>
    </div> : !open ? <div className="settings-save-row m-delete-account-start">
      <button type="button" className="m-btn m-delete-account-button" onClick={() => setOpen(true)}><Trash2 size={15} aria-hidden="true" />Delete account…</button>
    </div> : <div className="m-delete-account-panel">
      <p className="m-delete-account-warning"><AlertTriangle size={16} aria-hidden="true" /><strong>This can&apos;t be undone.</strong> Your account and all of its data are deleted right away. We keep no copy.</p>
      <p className="m-delete-account-label">What will be deleted:</p>
      <ul className="m-delete-account-list">{DELETED.map((line) => <li key={line}>{line}</li>)}</ul>
      <p className="m-muted">You&apos;ll be signed out on every device. You can sign up again later with the same email, but you&apos;ll start with an empty account.</p>

      {reconfirmed && !hasPassword && <p className="m-delete-account-ok" role="status">You signed in again, so you can finish now.</p>}

      <label className="settings-field" htmlFor={`${id}-confirm`}>Type {CONFIRM_WORD} to confirm
        <input id={`${id}-confirm`} value={typed} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={Boolean(busy)} onChange={(event) => { setTyped(event.target.value); setError(""); }} />
      </label>
      {hasPassword && <label className="settings-field" htmlFor={`${id}-password`}>Your password
        <input id={`${id}-password`} type="password" value={password} autoComplete="current-password" disabled={Boolean(busy)} onChange={(event) => { setPassword(event.target.value); setError(""); }} />
      </label>}
      {!hasPassword && (needsReauth || !reconfirmed) && providers.length > 0 && <div className="m-delete-account-reauth">
        <p className="m-muted">{needsReauth ? "Sign in again to confirm it's you:" : `If we ask you to confirm it's you, sign in again with ${providers.map((p) => PROVIDER_LABEL[p]).join(" or ")}:`}</p>
        <div className="m-delete-account-reauth-buttons">{providers.map((provider) => <button key={provider} type="button" className="m-btn m-btn-g" disabled={Boolean(busy)} onClick={() => void signInAgain(provider)}>
          {busy === "reauth" && <LoaderCircle className="spin" size={14} aria-hidden="true" />}Sign in again with {PROVIDER_LABEL[provider]}
        </button>)}</div>
      </div>}

      {error && <p className="settings-error" role="alert">{error}</p>}
      <div className="settings-save-row">
        <button type="button" className="m-btn m-btn-g" disabled={busy === "delete"} onClick={() => { setOpen(false); setTyped(""); setPassword(""); setError(""); setNeedsReauth(false); }}>Cancel</button>
        <button type="button" className="m-btn m-delete-account-button" disabled={!canDelete} onClick={() => void deleteAccount()}>
          {busy === "delete" ? <><LoaderCircle className="spin" size={15} aria-hidden="true" />Deleting…</> : <><Trash2 size={15} aria-hidden="true" />Delete my account</>}
        </button>
      </div>
    </div>}
  </section>;
}
