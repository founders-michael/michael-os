import "server-only";

import { redirect } from "next/navigation";
import { getRequestProfile, getRequestSession } from "@/lib/request-user-context";
import { hasProductPermission } from "@/lib/product-authorization";

/**
 * The guard every personal settings page runs before loading data: signed in,
 * LifestyleOS access, onboarding finished. Pages call it rather than repeating
 * the checks; the APIs they use enforce the same rules on their own.
 */
export async function requireSettingsUser() {
  const session = await getRequestSession();
  if (!session) redirect("/login");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getRequestProfile(session.user.id);
  if (!profile?.onboardingCompleted) redirect("/onboarding");
  return { userId: session.user.id, profile };
}
