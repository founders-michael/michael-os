import ProjectManagement from "@/components/project-management";
export const instant = false;
export default async function ProjectDetailPage({ params }: { params: Promise<{ organizationId: string; projectId: string }> }) {
  const { organizationId, projectId } = await params;
  return <ProjectManagement organizationId={organizationId} projectId={projectId} />;
}
