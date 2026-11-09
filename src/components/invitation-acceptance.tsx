"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Users } from "lucide-react";
import { notify } from "@/lib/notifications";

export default function InvitationAcceptance({ initialToken }: { initialToken: string }) {
  const router = useRouter(); const [token, setToken] = useState(initialToken); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [organization, setOrganization] = useState<{ name: string; slug: string } | null>(null); const [invitation, setInvitation] = useState<{ role: string; emailHint: string; invitedBy: string; status: string; expiresAt: string } | null>(null);
  useEffect(() => {
    if (!initialToken) return;
    let active = true;
    void fetch("/api/invitations/inspect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: initialToken }), cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { invitation?: { role: string; emailHint: string; invitedBy: string; status: string; expiresAt: string; organization: { name: string; slug: string } }; error?: string };
        if (!response.ok || !data.invitation) throw new Error(data.error || "This invitation is unavailable.");
        if (active) {
          setInvitation(data.invitation);
          setOrganization(data.invitation.organization);
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "This invitation is unavailable."); });
    return () => { active = false; };
  }, [initialToken]);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json() as { organization?: { id: string; name: string }; error?: string };
      if (!response.ok || !data.organization) throw new Error(data.error || "Invitation could not be accepted.");
      notify.success("Invitation accepted", `You joined ${data.organization.name}.`);
      router.replace(`/work/${data.organization.id}`); router.refresh();
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Invitation could not be accepted."; setError(message); notify.error("Invitation could not be accepted", message); }
    finally { setBusy(false); }
  }
  async function reject() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/invitations/reject", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Invitation could not be declined.");
      setInvitation((current) => current ? { ...current, status: "REVOKED" } : current);
      notify.success("Invitation declined");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Invitation could not be declined."; setError(message); notify.error("Invitation could not be declined", message); }
    finally { setBusy(false); }
  }
  const loginReturn = `/accept-invitation?token=${encodeURIComponent(token)}`;
  return <main className="organization-page"><div className="organization-content invitation-accept-page"><div className="organization-eyebrow"><Users size={16} />MICHAELOS · INVITATION</div><section className="organization-panel"><h1>Join an organization</h1><p>Accept using the verified email address that received this invitation.</p>{organization && <div className="organization-invitation-details"><strong>{organization.name}</strong><span>Invited by {invitation?.invitedBy ?? "an organization administrator"}</span>{invitation && <span>{invitation.role} · invitation for {invitation.emailHint} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>}</div>}{invitation && invitation.status !== "PENDING" && <p className="organization-notice" role="status">This invitation is {invitation.status.toLowerCase()} and cannot be used.</p>}{error && <p className="organization-alert" role="alert">{error}</p>}<form className="organization-form" onSubmit={(event) => void accept(event)}><label>Invitation token<input required minLength={40} maxLength={128} value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" /></label><button className="task-create-button" type="submit" disabled={busy || !token.trim() || (invitation !== null && invitation.status !== "PENDING")}>{busy ? <LoaderCircle size={15} /> : <ArrowRight size={15} />}Accept invitation</button>{invitation?.status === "PENDING" && <button className="organization-secondary-button" type="button" disabled={busy} onClick={() => void reject()}>{busy ? <LoaderCircle size={15} /> : null}Decline invitation</button>}</form><p className="organization-muted">Need an account? <Link href={`/register?returnTo=${encodeURIComponent(loginReturn)}`}>Create one</Link>. Already registered? <Link href={`/login?returnTo=${encodeURIComponent(loginReturn)}`}>Sign in</Link>.</p><Link href="/work" className="organization-back">Go to MichaelOS</Link></section></div></main>;
}
