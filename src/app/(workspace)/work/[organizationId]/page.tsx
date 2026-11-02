import OrganizationWorkspace from "@/components/organization-workspace";

export const instant = false;
type PageProps = { params: Promise<{ organizationId: string }> };

export default async function OrganizationOverviewPage({ params }: PageProps) {
  const { organizationId } = await params;
  return <OrganizationWorkspace organizationId={organizationId} section="overview" />;
}
