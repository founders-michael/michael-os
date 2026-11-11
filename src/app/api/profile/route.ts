import { getProfileForUser, saveProfileProgress } from "@/lib/profile-service";
import { profileProgressSchema } from "@/lib/profile-validation";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";

export const instant = false;

export async function GET() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in with an account that has LifestyleOS access." }, { status: 401 });

  try {
    const profile = await getProfileForUser(userId);
    return Response.json({ profile });
  } catch {
    console.error("[profile] Could not load the authenticated user's profile.");
    return Response.json({ error: "We couldn't load your profile. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in with an account that has LifestyleOS access." }, { status: 401 });

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
    const profile = await saveProfileProgress(userId, parsed.data);
    return Response.json({ profile });
  } catch {
    console.error("[profile] Could not save onboarding progress.");
    return Response.json({ error: "We couldn't save your progress. Please try again." }, { status: 500 });
  }
}
