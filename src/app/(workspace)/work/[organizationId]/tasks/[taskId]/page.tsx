import WorkTaskManager from "@/components/work-task-manager";

export const instant = false;

export default async function WorkTaskDetailPage({ params }: { params: Promise<{ organizationId: string; taskId: string }> }) {
  const { organizationId, taskId } = await params;
  return <WorkTaskManager organizationId={organizationId} taskId={taskId} />;
}
