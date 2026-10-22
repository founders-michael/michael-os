import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getProfileForUser, saveProfileProgress } from "@/lib/profile-service";
import { profileProgressSchema } from "@/lib/profile-validation";

export const instant = false;

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Sign in to access your profile." }, { status: 401 });

  try {
    const profile = await getProfileForUser(session.user.id);
    return Response.json({ profile });
  } catch {
    console.error("[profile] Could not load the authenticated user's profile.");
    return Response.json({ error: "We couldn't load your profile. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Sign in to save your profile." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send profile data as valid JSON." }, { status: 400 });
  }

  const parsed = profileProgressSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check the highlighted information and try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const profile = await saveProfileProgress(session.user.id, parsed.data);
    return Response.json({ profile });
  } catch {
    console.error("[profile] Could not save onboarding progress.");
    return Response.json({ error: "We couldn't save your progress. Please try again." }, { status: 500 });
  }
}
