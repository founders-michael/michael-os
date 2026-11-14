import { redirect } from "next/navigation";
import AssistantChat from "@/components/assistant-chat";
import { requireOrganizationPermission } from "@/lib/organization-authorization";
import { getAIUiStatus } from "@/lib/ai/config";
import { sanitizeAssistantPrompt } from "@/lib/ai/assistant-prompt";

export const instant = false;
type PageProps = { params: Promise<{ organizationId: string }>; searchParams: Promise<{ prompt?: string }> };

export default async function WorkAssistantPage({ params, searchParams }: PageProps) {
  const { organizationId } = await params;
  const initialPrompt = sanitizeAssistantPrompt((await searchParams).prompt);
  let context;
  try {
    context = await requireOrganizationPermission(organizationId, "organization.read");
  } catch {
    redirect("/work");
  }
  return <AssistantChat product="work" organizationId={organizationId} organizationName={context.organization.name} initialPrompt={initialPrompt} {...getAIUiStatus()} />;
}

