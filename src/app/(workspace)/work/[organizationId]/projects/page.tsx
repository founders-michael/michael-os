import ProjectManagement from "@/components/project-management";
export const instant = false;
export default async function ProjectsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <ProjectManagement key={organizationId} organizationId={organizationId} />;
}
