import AuthenticatedAppShell from "@/components/authenticated-app-shell";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { effectiveTimeZone } from "@/lib/time-zone";
import { listOrganizations } from "@/lib/organization-service";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getRequestSession();
  // Individual protected pages enforce authentication before loading their data.
  // Keeping this layout public lets the product chooser and product-specific
  // entry routes work without redirecting every visitor to LifestyleOS login.
  if (!session) return children;

  const [profile, organizations] = await Promise.all([
    getRequestProfile(session.user.id),
    listOrganizations(session.user.id),
  ]);
  const timeZone = effectiveTimeZone(profile?.timeZone);

  return <AuthenticatedAppShell
    userId={session.user.id}
    userName={profile?.preferredName || session.user.name || session.user.email}
    timeZone={timeZone}
    organizations={organizations}
    lifestyleReady={Boolean(profile?.onboardingCompleted)}
  >{children}</AuthenticatedAppShell>;
}
