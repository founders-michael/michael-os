import ProjectManagement from "@/components/project-management";
export const instant = false;
export default async function ProjectsPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <ProjectManagement organizationId={organizationId} />;
}
