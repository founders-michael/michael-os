"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Check, Copy, LoaderCircle, Mail, RefreshCw, Shield, Trash2, Users } from "lucide-react";

type Section = "overview" | "members" | "invitations" | "settings";
type Member = { id: string; name: string; email: string; role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER"; status: "ACTIVE" | "SUSPENDED" | "REMOVED"; joinedAt: string };
type Invitation = { id: string; email: string; role: "ADMIN" | "MANAGER" | "MEMBER"; expiresAt: string; createdAt: string; invitedBy: string };
type Organization = { id: string; name: string; slug: string; policy: { managerDefaultScope: "TEAM" | "ORGANIZATION" }; membership: { id: string; role: Member["role"]; status: Member["status"] } };
type ApiData = { organization?: Organization; members?: Member[]; invitations?: Invitation[]; policy?: Organization["policy"]; invitation?: Invitation; developmentHandoff?: { token: string; acceptUrl: string }; error?: string };

export default function OrganizationWorkspace({ organizationId, section }: { organizationId: string; section: Section }) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Invitation["role"]>("MEMBER");
  const [handoff, setHandoff] = useState<ApiData["developmentHandoff"]>();
  const [policy, setPolicy] = useState<"TEAM" | "ORGANIZATION">("TEAM");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const base = `/api/organizations/${organizationId}`;

  const fetchWorkspaceData = useCallback(async () => {
      const orgResponse = await fetch(base, { cache: "no-store" });
      const orgData = await orgResponse.json() as ApiData;
      if (!orgResponse.ok || !orgData.organization) throw new Error(orgData.error || "Organization could not be loaded.");
      let nextMembers: Member[] = [];
      let nextInvitations: Invitation[] = [];
      if (section === "members") {
        const response = await fetch(`${base}/members`, { cache: "no-store" }); const data = await response.json() as ApiData;
        if (!response.ok) throw new Error(data.error || "Member directory is unavailable for your current scope.");
        nextMembers = data.members ?? [];
      }
      if (section === "overview" && orgData.organization.membership.role === "OWNER") {
        const response = await fetch(`${base}/members`, { cache: "no-store" });
        if (response.ok) nextMembers = ((await response.json()) as ApiData).members ?? [];
      }
      if (section === "invitations") {
        const response = await fetch(`${base}/invitations`, { cache: "no-store" }); const data = await response.json() as ApiData;
        if (!response.ok) throw new Error(data.error || "Invitations could not be loaded.");
        nextInvitations = data.invitations ?? [];
      }
      return { organization: orgData.organization, members: nextMembers, invitations: nextInvitations };
  }, [base, section]);
  async function load() {
    setLoading(true); setError("");
    try { const data = await fetchWorkspaceData(); setOrganization(data.organization); setPolicy(data.organization.policy.managerDefaultScope); setMembers(data.members); setInvitations(data.invitations); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Organization could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void fetchWorkspaceData().then((data) => { if (active) { setOrganization(data.organization); setPolicy(data.organization.policy.managerDefaultScope); setMembers(data.members); setInvitations(data.invitations); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Organization could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchWorkspaceData]);

  async function patch(path: string, body: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${base}${path}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as ApiData;
      if (!response.ok) throw new Error(data.error || "The change could not be saved.");
      setNotice(success); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be saved."); }
    finally { setBusy(false); }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setHandoff(undefined);
    try {
      const response = await fetch(`${base}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role: inviteRole }) });
      const data = await response.json() as ApiData;
      if (!response.ok) throw new Error(data.error || "Invitation could not be created.");
      setEmail(""); setHandoff(data.developmentHandoff); setNotice(data.developmentHandoff ? "Development invitation created. Copy the handoff link now; the token is shown once." : "Invitation created."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation could not be created."); }
    finally { setBusy(false); }
  }

  async function revokeInvitation(id: string) {
    if (!window.confirm("Revoke this pending invitation?")) return;
    setBusy(true); setError("");
    try { const response = await fetch(`${base}/invitations/${id}`, { method: "DELETE" }); const data = await response.json() as ApiData; if (!response.ok) throw new Error(data.error || "Invitation could not be revoked."); setNotice("Invitation revoked."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation could not be revoked."); }
    finally { setBusy(false); }
  }

  async function updateMember(member: Member, changes: { role?: Member["role"]; status?: Member["status"] }) {
    if (!window.confirm(`Apply this membership change for ${member.name}?`)) return;
    await patch(`/members/${member.id}`, changes, "Membership updated.");
  }

  if (loading) return <main className="organization-page"><div className="organization-content"><div className="organization-loading"><LoaderCircle size={18} />Loading organization…</div></div></main>;
  if (!organization) return <main className="organization-page"><div className="organization-content"><p className="organization-alert" role="alert">{error || "Organization unavailable."}</p><Link href="/work" className="organization-back"><ArrowLeft size={15} />Your organizations</Link></div></main>;
  const canManage = organization.membership.role === "OWNER" || organization.membership.role === "ADMIN";
  const mayBrowseDirectory = canManage || (organization.membership.role === "MANAGER" && organization.policy.managerDefaultScope === "ORGANIZATION");
  const titles: Record<Section, string> = { overview: "Organization overview", members: "Members", invitations: "Invitations", settings: "Organization settings" };

  return <main className="organization-page"><div className="organization-content">
    <Link href="/work" className="organization-back"><ArrowLeft size={15} />All organizations</Link>
    <div className="organization-eyebrow"><Building2 size={16} />MICHAELOS · {organization.membership.role}</div>
    <div className="organization-heading"><div><h1>{section === "overview" ? organization.name : titles[section]}</h1><p>{section === "overview" ? "Your organization workspace is ready. Work features will be added in later milestones." : `${organization.name} · ${titles[section]}`}</p></div></div>
    {error && <p className="organization-alert" role="alert">{error}</p>}{notice && <p className="organization-notice" role="status">{notice}</p>}
    {section === "overview" && <div className="organization-grid"><section className="organization-panel"><div className="organization-panel-heading"><span><Shield size={18} /></span><div><h2>Workspace foundation</h2><p>Tenant boundaries and membership authorization are active.</p></div></div><dl className="organization-details"><div><dt>Workspace address</dt><dd>{organization.slug}</dd></div><div><dt>Your role</dt><dd>{organization.membership.role}</dd></div><div><dt>Manager default scope</dt><dd>{organization.policy.managerDefaultScope}</dd></div></dl><p className="organization-muted">TEAM scope is enforced conservatively. Since teams are not implemented yet, Managers with this scope cannot browse the full member directory.</p></section><section className="organization-panel"><div className="organization-panel-heading"><span><Users size={18} /></span><div><h2>What comes next</h2><p>This W1 workspace does not expose personal LifestyleOS data.</p></div></div><p>Projects, work tasks, teams, shared capacity, and organization planning are not part of this milestone.</p>{mayBrowseDirectory && <Link className="organization-button-link" href={`/work/${organizationId}/members`}>Manage members <Users size={15} /></Link>}</section></div>}
    {section === "members" && <section className="organization-panel"><div className="organization-panel-heading"><span><Users size={18} /></span><div><h2>Organization directory</h2><p>Basic account details and organization roles.</p></div></div>{members.length ? <div className="organization-table">{members.map((member) => <article className="organization-member-row" key={member.id}><div><strong>{member.name}</strong><span>{member.email}</span></div><span className="organization-role">{member.role}</span><span className={`organization-status status-${member.status.toLowerCase()}`}>{member.status}</span>{canManage && member.role !== "OWNER" ? <div className="organization-member-actions"><select aria-label={`Role for ${member.name}`} value={member.role} disabled={busy} onChange={(event) => void updateMember(member, { role: event.target.value as Member["role"] })}><option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="MEMBER">Member</option></select><button type="button" disabled={busy} onClick={() => void updateMember(member, { status: member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}>{member.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button></div> : <span className="organization-muted">{member.role === "OWNER" ? "Owner controls" : "View only"}</span>}</article>)}</div> : <p>No member records available.</p>}</section>}
    {section === "invitations" && <div className="organization-grid"><section className="organization-panel"><div className="organization-panel-heading"><span><Mail size={18} /></span><div><h2>Invite a teammate</h2><p>Invitations are valid for seven days and can’t grant Owner.</p></div></div>{canManage ? <form className="organization-form" onSubmit={(event) => void createInvitation(event)}><label>Email address<input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" /></label><label>Organization role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Invitation["role"])}><option value="MEMBER">Member</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option></select></label><button className="task-create-button" disabled={busy || !email.trim()} type="submit">{busy ? <LoaderCircle size={15} /> : <Mail size={15} />}Create invitation</button></form> : <p className="organization-muted">Only an Owner or Admin can create invitations.</p>}{handoff && <div className="organization-handoff"><strong>Development-only handoff</strong><p>No email was sent. Share this one-time link with the invited person now.</p><code>{handoff.acceptUrl}</code><button type="button" onClick={() => void navigator.clipboard.writeText(handoff.acceptUrl)}><Copy size={14} />Copy link</button></div>}</section><section className="organization-panel"><div className="organization-panel-heading"><span><Mail size={18} /></span><div><h2>Pending invitations</h2><p>Raw tokens are never included in this list.</p></div></div>{invitations.length ? <div className="organization-table">{invitations.map((invitation) => <article className="organization-member-row" key={invitation.id}><div><strong>{invitation.email}</strong><span>{invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></div>{canManage && <button className="organization-icon-button" aria-label={`Revoke invitation for ${invitation.email}`} disabled={busy} onClick={() => void revokeInvitation(invitation.id)}><Trash2 size={15} /></button>}</article>)}</div> : <p>No pending invitations.</p>}</section></div>}
    {section === "settings" && <section className="organization-panel"><div className="organization-panel-heading"><span><Shield size={18} /></span><div><h2>Manager default scope</h2><p>This controls which future organization data Managers may access.</p></div></div><p className="organization-muted">TEAM is the conservative default. With no Team model, team-scoped member listing is denied. ORGANIZATION permits only capabilities explicitly listed in the server permission map.</p><label className="organization-policy-select">Default scope<select value={policy} disabled={!canManage || busy} onChange={(event) => { const next = event.target.value as "TEAM" | "ORGANIZATION"; setPolicy(next); void patch("/policy", { managerDefaultScope: next }, "Policy updated."); }}><option value="TEAM">Team (conservative)</option><option value="ORGANIZATION">Organization</option></select></label>{!canManage && <p className="organization-muted">Policy changes require Owner or Admin permission.</p>}</section>}
    <div className="organization-refresh"><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={14} />Refresh</button>{section === "overview" && organization.membership.role === "OWNER" && <OwnershipTransfer organizationId={organizationId} members={members} onError={setError} onNotice={setNotice} />}</div>
  </div></main>;
}

function OwnershipTransfer({ organizationId, members, onError, onNotice }: { organizationId: string; members: Member[]; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [targetMembershipId, setTargetMembershipId] = useState(""); const [busy, setBusy] = useState(false);
  return <form className="organization-transfer" onSubmit={async (event) => { event.preventDefault(); if (!targetMembershipId || !window.confirm("Transfer organization ownership? You will become an Admin.")) return; setBusy(true); onError(""); try { const response = await fetch(`/api/organizations/${organizationId}/ownership`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetMembershipId }) }); const data = await response.json() as ApiData; if (!response.ok) throw new Error(data.error || "Ownership transfer failed."); onNotice("Ownership transferred."); } catch (cause) { onError(cause instanceof Error ? cause.message : "Ownership transfer failed."); } finally { setBusy(false); } }}><label>Transfer ownership<select aria-label="Transfer ownership to" value={targetMembershipId} onChange={(event) => setTargetMembershipId(event.target.value)}><option value="">Choose an active member</option>{members.filter((member) => member.status === "ACTIVE" && member.role !== "OWNER").map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label><button type="submit" disabled={busy || !targetMembershipId}>{busy ? <LoaderCircle size={14} /> : <Check size={14} />}Transfer</button></form>;
}
