import { redirect } from "next/navigation";
import AssistantChat from "@/components/assistant-chat";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { getAIUiStatus } from "@/lib/ai/config";
import { hasProductPermission } from "@/lib/product-authorization";
import { sanitizeAssistantPrompt } from "@/lib/ai/assistant-prompt";

export const instant = false;

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ reviewDate?: string; prompt?: string }> }) {
  const session = await getRequestSession();
  if (!session) redirect("/lifestyle/login?returnTo=%2Fassistant");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const resolvedSearchParams = await searchParams;
  const requestedDate = resolvedSearchParams.reviewDate;
  const parsedDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? new Date(`${requestedDate}T12:00:00.000Z`) : null;
  const validReviewDate = parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === requestedDate;
  // A review link wins over a launcher prompt: it is the more specific intent.
  const launcherPrompt = sanitizeAssistantPrompt(resolvedSearchParams.prompt);
  const initialPrompt = validReviewDate ? `Use the get_daily_review tool for ${requestedDate}. Summarize what I planned and completed, explain which commitments remain unfinished, and suggest realistic priorities for the next day. Clearly say when actual tracking or historical records are unavailable. Recommendations are suggestions only; do not make changes.` : undefined;
  return <AssistantChat product="lifestyle" timeZone={profile.timeZone} initialPrompt={initialPrompt ?? launcherPrompt} {...getAIUiStatus()} />;
}

