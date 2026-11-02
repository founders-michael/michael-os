"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, LoaderCircle, Plus, Users } from "lucide-react";

type OrganizationItem = { id: string; name: string; slug: string; membership: { role: string; status: string }; managerDefaultScope: string | null };
type ApiResult = { organizations?: OrganizationItem[]; organization?: OrganizationItem; error?: string; code?: string };

export default function OrganizationLanding() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void fetch("/api/organizations", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as ApiResult;
      if (!response.ok) throw new Error(data.error || "Organizations could not be loaded.");
      if (alive) setOrganizations(data.organizations ?? []);
    }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : "Organizations could not be loaded."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/organizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, ...(slug.trim() ? { slug } : {}) }) });
      const data = await response.json() as ApiResult;
      if (!response.ok || !data.organization) throw new Error(data.error || "Organization could not be created.");
      router.push(`/work/${data.organization.id}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Organization could not be created."); }
    finally { setSaving(false); }
  }

  return <main className="organization-page"><div className="organization-content">
    <div className="organization-eyebrow"><Building2 size={16} />MICHAELOS · WORKSPACE</div>
    <div className="organization-heading"><div><h1>Work, with a little more clarity.</h1><p>Create or open an organization. Personal tasks, habits, goals, and calendar stay separate in LifestyleOS.</p></div></div>
    {error && <p className="organization-alert" role="alert">{error}</p>}
    <div className="organization-grid">
      <section className="organization-panel"><div className="organization-panel-heading"><span><Users size={18} /></span><div><h2>Your organizations</h2><p>Only organizations where you have active membership appear here.</p></div></div>
        {loading ? <div className="organization-loading"><LoaderCircle size={18} />Loading organizations…</div> : organizations.length ? <div className="organization-list">{organizations.map((organization) => <Link key={organization.id} className="organization-list-item" href={`/work/${organization.id}`}><span className="organization-avatar">{organization.name.slice(0, 1).toUpperCase()}</span><span><strong>{organization.name}</strong><small>{organization.membership.role.toLowerCase()} · Manager scope: {organization.managerDefaultScope?.toLowerCase() ?? "unavailable"}</small></span><ArrowRight size={16} /></Link>)}</div> : <div className="organization-empty"><strong>No organization yet</strong><p>Create one to establish your MichaelOS work context. Team and project tools will arrive in later milestones.</p></div>}
      </section>
      <section className="organization-panel"><div className="organization-panel-heading"><span><Plus size={18} /></span><div><h2>Create an organization</h2><p>You’ll become its initial Owner.</p></div></div><form className="organization-form" onSubmit={(event) => void create(event)}><label>Organization name<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Studio" /></label><label>Workspace address <span>Optional</span><input pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*" maxLength={80} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="generated-from-name" /></label><button className="task-create-button" type="submit" disabled={saving || !name.trim()}>{saving ? <LoaderCircle size={15} /> : <Plus size={15} />}Create organization</button></form></section>
    </div>
    <div className="organization-coming-soon"><strong>W1 foundation</strong><p>Organizations and membership are ready. Work tasks, projects, teams, and shared planning are intentionally not available yet.</p></div>
  </div></main>;
}
