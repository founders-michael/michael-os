"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Users } from "lucide-react";

export default function InvitationAcceptance({ initialToken }: { initialToken: string }) {
  const router = useRouter(); const [token, setToken] = useState(initialToken); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [organization, setOrganization] = useState("");
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json() as { organization?: { id: string; name: string }; error?: string };
      if (!response.ok || !data.organization) throw new Error(data.error || "Invitation could not be accepted.");
      setOrganization(data.organization.name); router.replace(`/work/${data.organization.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation could not be accepted."); }
    finally { setBusy(false); }
  }
  const loginReturn = `/accept-invitation?token=${encodeURIComponent(token)}`;
  return <main className="organization-page"><div className="organization-content invitation-accept-page"><div className="organization-eyebrow"><Users size={16} />MICHAELOS · INVITATION</div><section className="organization-panel"><h1>Join an organization</h1><p>Sign in with the verified email address that received this invitation.</p>{organization && <p role="status">Joining {organization}…</p>}{error && <p className="organization-alert" role="alert">{error}</p>}<form className="organization-form" onSubmit={(event) => void accept(event)}><label>Invitation token<input required minLength={40} maxLength={128} value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" /></label><button className="task-create-button" type="submit" disabled={busy || !token.trim()}>{busy ? <LoaderCircle size={15} /> : <ArrowRight size={15} />}Accept invitation</button></form><p className="organization-muted">Need an account? <Link href={`/register?returnTo=${encodeURIComponent(loginReturn)}`}>Create one</Link>. Already registered? <Link href={`/login?returnTo=${encodeURIComponent(loginReturn)}`}>Sign in</Link>.</p><Link href="/work" className="organization-back">Go to MichaelOS</Link></section></div></main>;
}
