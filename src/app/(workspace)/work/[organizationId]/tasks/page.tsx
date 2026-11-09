import WorkTaskManager from "@/components/work-task-manager";

export const instant = false;

export default async function WorkTasksPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <WorkTaskManager organizationId={organizationId} />;
}
