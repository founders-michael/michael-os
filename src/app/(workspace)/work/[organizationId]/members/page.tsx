import OrganizationWorkspace from "@/components/organization-workspace";

export const instant = false;
type PageProps = { params: Promise<{ organizationId: string }> };
export default async function OrganizationMembersPage({ params }: PageProps) {
  return <OrganizationWorkspace organizationId={(await params).organizationId} section="members" />;
}
