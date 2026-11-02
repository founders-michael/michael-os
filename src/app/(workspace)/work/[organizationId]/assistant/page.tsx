import { redirect } from "next/navigation";
import AssistantChat from "@/components/assistant-chat";
import { requireOrganizationPermission } from "@/lib/organization-authorization";
import { getAIUiStatus } from "@/lib/ai/config";

export const instant = false;
type PageProps = { params: Promise<{ organizationId: string }> };

export default async function WorkAssistantPage({ params }: PageProps) {
  const { organizationId } = await params;
  let context;
  try {
    context = await requireOrganizationPermission(organizationId, "organization.read");
  } catch {
    redirect("/work");
  }
  return <AssistantChat product="work" organizationId={organizationId} organizationName={context.organization.name} {...getAIUiStatus()} />;
}

