"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Check, Copy, LoaderCircle, Mail, RefreshCw, Shield, Trash2, Users } from "lucide-react";
import { canManageMember } from "@/lib/organization-permissions";
import { PageSkeleton } from "@/components/ux/ux-states";
import { notify } from "@/lib/notifications";
import { useConfirmation } from "@/components/ux/confirmation-provider";

type Section = "overview" | "members" | "invitations" | "settings";
type Member = { id: string; name: string; email: string; role: "OWNER" | "ADMIN" | "MANAGER" | "MEMBER"; status: "ACTIVE" | "SUSPENDED" | "REMOVED"; joinedAt: string };
type Invitation = { id: string; email: string; role: "ADMIN" | "MANAGER" | "MEMBER"; status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED"; declined: boolean; expiresAt: string; createdAt: string; updatedAt: string; invitedBy: string };
type Organization = { id: string; name: string; slug: string; policy: { managerDefaultScope: "TEAM" | "ORGANIZATION" }; membership: { id: string; role: Member["role"]; status: Member["status"] } };
type ApiData = { organization?: Organization; members?: Member[]; invitations?: Invitation[]; policy?: Organization["policy"]; invitation?: Invitation; developmentHandoff?: { token: string; acceptUrl: string }; error?: string };

export default function OrganizationWorkspace({ organizationId, section }: { organizationId: string; section: Section }) {
  const confirm = useConfirmation();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Invitation["role"]>("MEMBER");
  const [handoff, setHandoff] = useState<ApiData["developmentHandoff"]>();
  const [policy, setPolicy] = useState<"TEAM" | "ORGANIZATION">("TEAM");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
      if (section === "overview" && (orgData.organization.membership.role === "OWNER" || orgData.organization.membership.role === "ADMIN")) {
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
    try { const data = await fetchWorkspaceData(); setOrganization(data.organization); setOrganizationName(data.organization.name); setOrganizationSlug(data.organization.slug); setPolicy(data.organization.policy.managerDefaultScope); setMembers(data.members); setInvitations(data.invitations); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Organization could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void fetchWorkspaceData().then((data) => { if (active) { setOrganization(data.organization); setOrganizationName(data.organization.name); setOrganizationSlug(data.organization.slug); setPolicy(data.organization.policy.managerDefaultScope); setMembers(data.members); setInvitations(data.invitations); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Organization could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchWorkspaceData]);

  async function patch(path: string, body: unknown, success: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${base}${path}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as ApiData;
      if (!response.ok) throw new Error(data.error || "The change could not be saved.");
      notify.success(success); await load();
    } catch (cause) { const message = cause instanceof Error ? cause.message : "The change could not be saved."; setError(message); notify.error("Organization change could not be saved", message); }
    finally { setBusy(false); }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setHandoff(undefined);
    try {
      const response = await fetch(`${base}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role: inviteRole }) });
      const data = await response.json() as ApiData;
      if (!response.ok) throw new Error(data.error || "Invitation could not be created.");
      setEmail(""); setHandoff(data.developmentHandoff); if (!data.developmentHandoff) notify.success("Invitation created"); await load();
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Invitation could not be created."; setError(message); notify.error("Invitation could not be created", message); }
    finally { setBusy(false); }
  }

  async function revokeInvitation(id: string) {
    await confirm({ title: "Revoke this invitation?", description: "The pending invitation link will stop working.", confirmLabel: "Revoke invitation", destructive: true }, async () => {
      setBusy(true); setError("");
      try { const response = await fetch(`${base}/invitations/${id}`, { method: "DELETE" }); const data = await response.json() as ApiData; if (!response.ok) throw new Error(data.error || "Invitation could not be revoked."); notify.success("Invitation revoked"); await load(); }
      catch (cause) { const message = cause instanceof Error ? cause.message : "Invitation could not be revoked."; setError(message); notify.error("Invitation could not be revoked", message); }
      finally { setBusy(false); }
    });
  }

  async function resendInvitation(id: string) {
    setBusy(true); setError(""); setHandoff(undefined);
    try {
      const response = await fetch(`${base}/invitations/${id}`, { method: "POST" });
      const data = await response.json() as ApiData;
      if (!response.ok) throw new Error(data.error || "Invitation could not be resent.");
      setHandoff(data.developmentHandoff);
      if (!data.developmentHandoff) notify.success("Invitation resent");
      await load();
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Invitation could not be resent."; setError(message); notify.error("Invitation could not be resent", message); }
    finally { setBusy(false); }
  }

  async function updateMember(member: Member, changes: { role?: Member["role"]; status?: Member["status"] }) {
    await confirm({ title: `Update ${member.name}'s membership?`, description: "This change affects the member's access to this organization.", confirmLabel: "Update membership", destructive: changes.status === "SUSPENDED" || changes.status === "REMOVED" }, () => patch(`/members/${member.id}`, changes, "Membership updated."));
  }

  if (loading) return <PageSkeleton variant={section === "overview" ? "organization" : "list"} label="Loading organization" />;
  if (!organization) return <main className="organization-page"><div className="organization-content"><p className="organization-alert" role="alert">{error || "Organization unavailable."}</p><Link href="/work" className="organization-back"><ArrowLeft size={15} />Your organizations</Link></div></main>;
  const canManage = organization.membership.role === "OWNER" || organization.membership.role === "ADMIN";
  const mayBrowseDirectory = canManage || (organization.membership.role === "MANAGER" && organization.policy.managerDefaultScope === "ORGANIZATION");
  const titles: Record<Section, string> = { overview: "Organization overview", members: "Members", invitations: "Invitations", settings: "Organization settings" };

  return <main className="organization-page"><div className="organization-content">
    <Link href="/work" className="organization-back"><ArrowLeft size={15} />All organizations</Link>
    <div className="organization-eyebrow"><Building2 size={16} />MICHAELOS · {organization.membership.role}</div>
    <div className="organization-heading"><div><h1>{section === "overview" ? organization.name : titles[section]}</h1><p>{section === "overview" ? "Your organization workspace for teams and projects." : `${organization.name} · ${titles[section]}`}</p></div></div>
    {error && <p className="organization-alert" role="alert">{error}</p>}
    {section === "overview" && <div className="organization-grid"><section className="organization-panel"><div className="organization-panel-heading"><span><Shield size={18} /></span><div><h2>Workspace foundation</h2><p>Tenant boundaries and membership authorization are active.</p></div></div><dl className="organization-details"><div><dt>Workspace address</dt><dd>{organization.slug}</dd></div><div><dt>Your role</dt><dd>{organization.membership.role}</dd></div><div><dt>Manager default scope</dt><dd>{organization.policy.managerDefaultScope}</dd></div></dl><p className="organization-muted">TEAM scope is enforced conservatively. Managers with this scope can access only teams and projects assigned through explicit scoped relationships.</p></section><section className="organization-panel"><div className="organization-panel-heading"><span><Users size={18} /></span><div><h2>WorkOS workspace</h2><p>Organization work is separate from personal LifestyleOS data.</p></div></div><p>Coordinate teams, projects, and assigned work in this organization.</p><div className="organization-overview-links"><Link className="organization-button-link" href={`/work/${organizationId}/teams`}>Manage teams <Users size={15} /></Link><Link className="organization-button-link" href={`/work/${organizationId}/projects`}>Manage projects <Building2 size={15} /></Link><Link className="organization-button-link" href={`/work/${organizationId}/tasks`}>Manage tasks <Check size={15} /></Link>{mayBrowseDirectory && <Link className="organization-button-link" href={`/work/${organizationId}/members`}>Manage members <Users size={15} /></Link>}</div></section></div>}
    {section === "members" && <section className="organization-panel"><div className="organization-panel-heading"><span><Users size={18} /></span><div><h2>Organization directory</h2><p>Basic account details and organization roles.</p></div></div>{members.length ? <div className="organization-table">{members.map((member) => { const mayManage = canManageMember(organization.membership.role, member.role, organization.membership.id, member.id); return <article className="organization-member-row" key={member.id}><div><strong>{member.name}</strong><span>{member.email}</span></div><span className="organization-role">{member.role}</span><span className={`organization-status status-${member.status.toLowerCase()}`}>{member.status}</span>{mayManage ? <div className="organization-member-actions"><select aria-label={`Role for ${member.name}`} value={member.role} disabled={busy} onChange={(event) => void updateMember(member, { role: event.target.value as Member["role"] })}><option value="MEMBER">Member</option><option value="MANAGER">Manager</option>{organization.membership.role === "OWNER" && <option value="ADMIN">Admin</option>}</select><button type="button" disabled={busy} onClick={() => void updateMember(member, { status: member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}>{member.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button><button type="button" disabled={busy} onClick={() => void updateMember(member, { status: "REMOVED" })}>Remove</button></div> : <span className="organization-muted">{member.role === "OWNER" ? "Owner controls" : "View only"}</span>}</article>; })}</div> : <p>No member records available.</p>}</section>}
    {section === "invitations" && <div className="organization-grid"><section className="organization-panel"><div className="organization-panel-heading"><span><Mail size={18} /></span><div><h2>Invite a teammate</h2><p>Invitations are valid for seven days and can’t grant Owner.</p></div></div>{canManage ? <form className="organization-form" onSubmit={(event) => void createInvitation(event)}><label>Email address<input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@example.com" /></label><label>Organization role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Invitation["role"])}><option value="MEMBER">Member</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option></select></label><button className="task-create-button" disabled={busy || !email.trim()} type="submit">{busy ? <LoaderCircle size={15} /> : <Mail size={15} />}Create invitation handoff</button></form> : <p className="organization-muted">Only an Owner or Admin can create invitations.</p>}{handoff && <div className="organization-handoff"><strong>Development-only handoff</strong><p>No email was sent. Share this one-time link with the invited person now. Resending invalidates older links.</p><code>{handoff.acceptUrl}</code><button type="button" onClick={() => void navigator.clipboard.writeText(handoff.acceptUrl)}><Copy size={14} />Copy link</button></div>}</section><section className="organization-panel"><div className="organization-panel-heading"><span><Mail size={18} /></span><div><h2>Invitation history</h2><p>Raw tokens are never included in this list.</p></div></div>{invitations.length ? <div className="organization-table">{invitations.map((invitation) => <article className="organization-member-row" key={invitation.id}><div><strong>{invitation.email}</strong><span>{invitation.role} · {invitation.status === "PENDING" || invitation.status === "EXPIRED" ? `expires ${new Date(invitation.expiresAt).toLocaleDateString()}` : invitation.declined ? "declined by recipient" : invitation.status.toLowerCase()}</span><small>Invited by {invitation.invitedBy}</small></div><span className={`organization-status status-${invitation.status.toLowerCase()}`}>{invitation.status}</span>{canManage && (invitation.status === "PENDING" || invitation.status === "EXPIRED") && <div className="organization-member-actions">{invitation.status === "PENDING" && <button className="organization-icon-button" aria-label={`Revoke invitation for ${invitation.email}`} disabled={busy} onClick={() => void revokeInvitation(invitation.id)}><Trash2 size={15} /></button>}<button type="button" disabled={busy} onClick={() => void resendInvitation(invitation.id)}><RefreshCw size={14} />Resend</button></div>}</article>)}</div> : <p>No invitations yet.</p>}</section></div>}
    {section === "settings" && <div className="organization-grid"><section className="organization-panel"><div className="organization-panel-heading"><span><Building2 size={18} /></span><div><h2>Organization details</h2><p>Changes apply to this WorkOS organization only.</p></div></div><form className="organization-form" onSubmit={(event) => { event.preventDefault(); void patch("", { name: organizationName, slug: organizationSlug }, "Organization details updated."); }}><label>Organization name<input required minLength={2} maxLength={120} disabled={!canManage || busy} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></label><label>Workspace address<input required minLength={2} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" disabled={!canManage || busy} value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value.toLowerCase())} /></label><button className="task-create-button" type="submit" disabled={!canManage || busy || !organizationName.trim() || !organizationSlug.trim()}>{busy ? <LoaderCircle size={15} /> : <Check size={15} />}Save details</button>{!canManage && <p className="organization-muted">Organization details require Owner or Admin permission.</p>}</form><p className="organization-muted">Organization ID: <code>{organization.id}</code></p></section><section className="organization-panel"><div className="organization-panel-heading"><span><Shield size={18} /></span><div><h2>Manager default scope</h2><p>This controls which future organization data Managers may access.</p></div></div><p className="organization-muted">TEAM is the conservative default. With no Team model, team-scoped member listing is denied. ORGANIZATION permits only capabilities explicitly listed in the server permission map.</p><label className="organization-policy-select">Default scope<select value={policy} disabled={!canManage || busy} onChange={(event) => { const next = event.target.value as "TEAM" | "ORGANIZATION"; setPolicy(next); void patch("/policy", { managerDefaultScope: next }, "Policy updated."); }}><option value="TEAM">Team (conservative)</option><option value="ORGANIZATION">Organization</option></select></label>{!canManage && <p className="organization-muted">Policy changes require Owner or Admin permission.</p>}</section></div>}
    <div className="organization-refresh"><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={14} />Refresh</button>{section === "overview" && organization.membership.role === "OWNER" && <OwnershipTransfer organizationId={organizationId} members={members} onError={setError} onNotice={(message) => notify.success(message)} />}</div>
  </div></main>;
}

function OwnershipTransfer({ organizationId, members, onError, onNotice }: { organizationId: string; members: Member[]; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [targetMembershipId, setTargetMembershipId] = useState(""); const [busy, setBusy] = useState(false);
  const confirm = useConfirmation();
  async function transfer() {
    if (!targetMembershipId) return;
    setBusy(true); onError("");
    try { const response = await fetch(`/api/organizations/${organizationId}/ownership`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetMembershipId }) }); const data = await response.json() as ApiData; if (!response.ok) throw new Error(data.error || "Ownership transfer failed."); onNotice("Ownership transferred."); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "Ownership transfer failed."; onError(message); notify.error("Ownership transfer failed", message); }
    finally { setBusy(false); }
  }
  return <form className="organization-transfer" onSubmit={(event) => { event.preventDefault(); void confirm({ title: "Transfer organization ownership?", description: "You will become an Admin, and the selected active member will become the Owner.", confirmLabel: "Transfer ownership", destructive: true }, transfer); }}><label>Transfer ownership<select aria-label="Transfer ownership to" value={targetMembershipId} onChange={(event) => setTargetMembershipId(event.target.value)}><option value="">Choose an active member</option>{members.filter((member) => member.status === "ACTIVE" && member.role !== "OWNER").map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select></label><button type="submit" disabled={busy || !targetMembershipId}>{busy ? <LoaderCircle size={14} /> : <Check size={14} />}Transfer</button></form>;
}
