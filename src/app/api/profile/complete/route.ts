import { completeOnboarding } from "@/lib/profile-service";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";

export const instant = false;

export async function POST() {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in with an account that has LifestyleOS access." }, { status: 401 });

  try {
    const profile = await completeOnboarding(userId);
    if (!profile) {
      return Response.json({ error: "Save your onboarding details before finishing." }, { status: 400 });
    }
    return Response.json({ profile });
  } catch {
    console.error("[profile] Could not complete onboarding.");
    return Response.json({ error: "We couldn't finish setting up your profile. Please try again." }, { status: 500 });
  }
}
