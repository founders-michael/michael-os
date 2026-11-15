import { redirect } from "next/navigation";
import AssistantChat from "@/components/assistant-chat";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { getAIUiStatus } from "@/lib/ai/config";
import { hasProductPermission } from "@/lib/product-authorization";
import { sanitizeAssistantPrompt } from "@/lib/ai/assistant-prompt";
import { LIFESTYLE_TOOL_NAMES } from "@/lib/ai/tools";
import { toolLabel } from "@/lib/ai/tool-labels";

const WEEKDAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const weekdayShort = (day: string) => day.charAt(0) + day.slice(1, 3).toLowerCase();

/** Collapses a run of consecutive weekdays to "Mon–Sat"; otherwise lists them. */
function workDaysLabel(days: string[]) {
  const indexes = days.map((day) => WEEKDAY_ORDER.indexOf(day)).filter((index) => index >= 0).sort((a, b) => a - b);
  if (!indexes.length) return null;
  const consecutive = indexes.every((value, i) => i === 0 || value === indexes[i - 1]! + 1);
  if (consecutive && indexes.length > 2) return `${weekdayShort(WEEKDAY_ORDER[indexes[0]!]!)}–${weekdayShort(WEEKDAY_ORDER[indexes.at(-1)!]!)}`;
  return indexes.map((index) => weekdayShort(WEEKDAY_ORDER[index]!)).join(", ");
}

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
  // What Michael can read is exactly its LifestyleOS read tools, described in their own words.
  const sources = LIFESTYLE_TOOL_NAMES.map(toolLabel).filter((tool) => tool.kind === "read").map(({ label, detail }) => ({ label, detail }));
  const workDays = workDaysLabel(profile.workDays);
  const memory = [
    `Wake ${profile.wakeUpTime} · bed ${profile.bedtime}`,
    `${profile.focusSessionMinutes} min focus · ${profile.breakDurationMinutes} min break`,
    ...(workDays ? [`Works ${workDays}${profile.workStartTime && profile.workEndTime ? `, ${profile.workStartTime}–${profile.workEndTime}` : ""}`] : []),
    `Planning style: ${profile.planningStyle.toLowerCase()}`,
  ];
  return <AssistantChat product="lifestyle" timeZone={profile.timeZone} initialPrompt={initialPrompt ?? launcherPrompt} sources={sources} memory={memory} {...getAIUiStatus()} />;
}

