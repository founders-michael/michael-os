import { redirect } from "next/navigation";
import DailyReview from "@/components/daily-review";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { hasProductPermission } from "@/lib/product-authorization";
import { effectiveTimeZone } from "@/lib/time-zone";
import { getDailyReviewData, reviewDateFromRequest } from "@/lib/daily-review-service";

export const instant = false;

export default async function DailyReviewPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getRequestSession();
  if (!session) redirect("/lifestyle/login?returnTo=%2Freview");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  const timeZone = effectiveTimeZone(profile.timeZone);
  const date = reviewDateFromRequest((await searchParams).date ?? null, timeZone);
  const data = await getDailyReviewData(session.user.id, timeZone, date);
  return <DailyReview key={date} data={data} />;
}
