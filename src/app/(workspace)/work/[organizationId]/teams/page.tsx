import TeamManagement from "@/components/team-management";
export const instant = false;
export default async function TeamsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <TeamManagement organizationId={organizationId} />;
}
