import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { completeOnboarding } from "@/lib/profile-service";

export const instant = false;

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Sign in to finish onboarding." }, { status: 401 });

  try {
    const profile = await completeOnboarding(session.user.id);
    if (!profile) {
      return Response.json({ error: "Save your onboarding details before finishing." }, { status: 400 });
    }
    return Response.json({ profile });
  } catch {
    console.error("[profile] Could not complete onboarding.");
    return Response.json({ error: "We couldn't finish setting up your profile. Please try again." }, { status: 500 });
  }
}
