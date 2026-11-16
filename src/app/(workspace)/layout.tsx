import AuthenticatedAppShell from "@/components/authenticated-app-shell";
import { getRequestIdentity, getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { effectiveTimeZone } from "@/lib/time-zone";
import { listOrganizations } from "@/lib/organization-service";
import { hasProductPermission } from "@/lib/product-authorization";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getRequestSession();
  // Individual protected pages enforce authentication before loading their data.
  // Keeping this layout public lets the product chooser and product-specific
  // entry routes work without redirecting every visitor to LifestyleOS login.
  if (!session) return children;

  const [profile, identity, workAccess] = await Promise.all([
    getRequestProfile(session.user.id),
    getRequestIdentity(session.user.id),
    hasProductPermission(session.user.id, "WORK_OS_ACCESS"),
  ]);
  const organizations = workAccess ? await listOrganizations(session.user.id) : [];
  const timeZone = effectiveTimeZone(profile?.timeZone);

  return <AuthenticatedAppShell
    userId={session.user.id}
    identity={identity}
    timeZone={timeZone}
    organizations={organizations}
    lifestyleReady={Boolean(profile?.onboardingCompleted)}
  >{children}</AuthenticatedAppShell>;
}
