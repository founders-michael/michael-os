import TeamManagement from "@/components/team-management";
export const instant = false;
export default async function TeamDetailPage({ params }: { params: Promise<{ organizationId: string; teamId: string }> }) {
  const { organizationId, teamId } = await params;
  return <TeamManagement key={`${organizationId}:${teamId}`} organizationId={organizationId} teamId={teamId} />;
}
