import MichaelPresence from "@/components/michael/michael-presence";
import { redirect } from "next/navigation";
import { CalendarDays, Cloud, Mail, MessageSquare, NotebookPen, Video } from "lucide-react";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { hasProductPermission } from "@/lib/product-authorization";

export const instant = false;

const integrations = [
  { name: "Google Calendar", category: "Calendar", description: "Bring your external meetings and events into your MichaelOS schedule.", icon: CalendarDays },
  { name: "Outlook Calendar", category: "Calendar", description: "See work and personal commitments alongside your planned sessions.", icon: CalendarDays },
  { name: "Notion", category: "Notes & knowledge", description: "Connect notes and project context to the priorities you are working on.", icon: NotebookPen },
  { name: "Gmail", category: "Email", description: "Turn important messages into context for your day, with your control over what is shared.", icon: Mail },
  { name: "Google Drive", category: "Files", description: "Keep relevant documents close to the goals and projects they support.", icon: Cloud },
  { name: "Slack", category: "Team communication", description: "Bring selected team updates into a calmer view of your commitments.", icon: MessageSquare },
  { name: "Zoom", category: "Meetings", description: "Keep meeting details connected to your calendar and daily plan.", icon: Video },
];

export default async function PluginsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/login");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");

  return <main className="m-page m-plugins">
    <header className="m-page-head"><div className="m-page-head-copy"><div className="m-eyebrow">Your connected workspace</div><h1 className="m-display"><span className="m-glow">Integrations</span></h1><p className="m-muted">Tools Michael may connect with to bring your plans together. Each one would give Michael more context — only with your permission.</p></div></header>
    <section className="m-ai m-line" aria-label="Michael">
      <span className="m-orbw" aria-hidden="true" style={{ width: 34, height: 34 }}><span className="m-ring" /><span className="m-ring m-r2" /><MichaelPresence state="idle" size="md" /></span>
      <p><span className="m-neon">Michael · </span>Nothing is connected yet. These are planned integrations, not active connections. You’ll review exactly what I can read before connecting any account.</p>
    </section>
    <section className="m-plugin-grid" aria-label="Planned integrations">{integrations.map(({ name, category, description, icon: Icon }) => <article className="m-card m-lift m-plugin" key={name}>
      <div className="m-plugin-top"><span className="m-plugin-icon" aria-hidden="true"><Icon size={21} /></span><span className="m-chip">Planned</span></div>
      <div className="m-eyebrow">{category}</div>
      <h2 className="m-h2">{name}</h2>
      <p className="m-muted">{description}</p>
    </article>)}</section>
    <p className="m-muted m-plugins-note">Connections will be optional. Michael will only use the data you authorize.</p>
  </main>;
}
