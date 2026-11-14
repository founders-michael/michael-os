import Dashboard from "@/components/dashboard";
import { redirect } from "next/navigation";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { getTaskDashboardData } from "@/lib/task-service";
import { getGoalDashboardData } from "@/lib/goal-service";
import { getHabitDashboardData } from "@/lib/habit-service";
import { localDateAt } from "@/lib/calendar-date";
import { getAvailability } from "@/lib/calendar-service";
import { effectiveTimeZone } from "@/lib/time-zone";
import ProductSelection from "@/components/product-selection";
import { isDateOnly } from "@/lib/task-classification";
import { getUserProductPermissions } from "@/lib/product-authorization";
import { productExperiencesForPermissions } from "@/lib/product-permission-policy";
import StructuredData from "@/components/structured-data";
import { landingStructuredData } from "@/lib/structured-data";
import type { Metadata } from "next";

export const instant = false;

/**
 * `/` is the only public page, so it is the only route that declares a
 * canonical URL. The rest of the app is noindex via `privatePageMetadata`.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getRequestSession();

  // The unauthenticated landing page is the indexable surface, so it is the
  // only render path that emits structured data.
  if (!session) return <><StructuredData data={landingStructuredData()} /><ProductSelection /></>;

  const productPermissions = await getUserProductPermissions(session.user.id);
  const availableProducts = productExperiencesForPermissions(productPermissions);
  if (!productPermissions.includes("LIFESTYLE_OS_ACCESS")) {
    if (productPermissions.includes("WORK_OS_ACCESS")) redirect("/work");
    redirect("/products?access=denied");
  }

  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) {
    return <ProductSelection authenticated authenticatedName={profile?.preferredName || session.user.name || undefined} availableProducts={availableProducts} />;
  }
  const timeZone = effectiveTimeZone(profile.timeZone);
  const actualToday = localDateAt(timeZone);
  const requestedDate = (await searchParams).date;
  const selectedDate = isDateOnly(requestedDate) ? requestedDate : actualToday;
  const [tasksResult, goalsResult, habitsResult, availabilityResult] = await Promise.all([
    getTaskDashboardData(session.user.id, timeZone, selectedDate).catch(() => { console.error("[my-day] Task and calendar summary unavailable."); return null; }),
    getGoalDashboardData(session.user.id, timeZone).catch(() => { console.error("[my-day] Goal summary unavailable."); return null; }),
    getHabitDashboardData(session.user.id, timeZone).catch(() => { console.error("[my-day] Habit summary unavailable."); return null; }),
    getAvailability(session.user.id).catch(() => { console.error("[my-day] Availability summary unavailable."); return null; }),
  ]);

  return <Dashboard
    userName={profile.preferredName || session.user.name || session.user.email}
    priorities={profile.priorities}
    timeZone={timeZone}
    wakeUpTime={profile.wakeUpTime}
    focusSessionMinutes={profile.focusSessionMinutes}
    taskSections={tasksResult?.sections ?? null}
    taskSummary={tasksResult?.summary ?? null}
    dailyTasks={tasksResult?.dailyTasks ?? null}
    dailySummary={tasksResult?.dailySummary ?? null}
    selectedDate={selectedDate}
    actualToday={actualToday}
    initialGoals={goalsResult?.goals ?? null}
    goalSummary={goalsResult?.summary ?? null}
    initialHabits={habitsResult?.habits ?? null}
    habitSummary={habitsResult?.summary ?? null}
    calendarEvents={tasksResult?.calendarEvents ?? null}
    availabilityConfigured={availabilityResult?.configured ?? null}
    now={new Date().toISOString()}
  />;
}
