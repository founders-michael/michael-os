import { redirect } from "next/navigation";
import AssistantChat from "@/components/assistant-chat";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { getAIUiStatus } from "@/lib/ai/config";

export const instant = false;

export default async function AssistantPage() {
  const session = await getRequestSession();
  if (!session) redirect("/lifestyle/login?returnTo=%2Fassistant");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  return <AssistantChat product="lifestyle" timeZone={profile.timeZone} {...getAIUiStatus()} />;
}

