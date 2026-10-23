import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays, Check, Cloud, Mail, MessageSquare, NotebookPen, Video } from "lucide-react";
import WorkspacePageHeader from "@/components/workspace-page-header";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { preferredName: true, onboardingCompleted: true } });
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const userName = profile.preferredName || session.user.name || session.user.email;

  return <main className="goals-workspace">
    <WorkspacePageHeader userName={userName} active="Plugins" />
    <div className="goals-content product-page-content">
      <div className="goals-heading"><div><div className="section-kicker">YOUR CONNECTED WORKSPACE</div><h1>Plugins</h1><p>Tools MichaelOS may connect with to bring your plans together.</p></div><span className="plugins-roadmap-badge">INTEGRATION ROADMAP</span></div>
      <div className="plugins-intro"><span className="plugins-intro-icon"><Check size={18} /></span><p><strong>Nothing is connected yet.</strong> These are planned integrations, not active connections. You’ll be able to review permissions before connecting an account.</p></div>
      <section className="plugin-grid" aria-label="Planned integrations">{integrations.map(({ name, category, description, icon: Icon }) => <article className="plugin-card" key={name}><div className="plugin-card-heading"><span className="plugin-card-icon"><Icon size={19} /></span><span className="plugin-status">Planned</span></div><div className="section-kicker">{category}</div><h2>{name}</h2><p>{description}</p></article>)}</section>
      <p className="plugins-privacy-note">Connections will be optional. MichaelOS will only use the data you authorize.</p>
    </div>
  </main>;
}
