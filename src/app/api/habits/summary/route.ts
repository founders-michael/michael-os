import { authenticatedHabitUser } from "@/lib/habit-api";
import { getHabitDashboardData } from "@/lib/habit-service";

export const instant = false;

export async function GET() {
  const user = await authenticatedHabitUser();
  if (!user) return Response.json({ error: "Sign in to access habits." }, { status: 401 });
  try { return Response.json(await getHabitDashboardData(user.id, user.timeZone)); }
  catch { console.error("[habits] Could not load the habit summary."); return Response.json({ error: "We couldn't load your habit summary. Please try again." }, { status: 500 }); }
}
