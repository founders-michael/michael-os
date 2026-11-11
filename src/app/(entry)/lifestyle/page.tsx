import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";
import { signedInProductDestination } from "@/lib/product-entry";
import { hasProductPermission } from "@/lib/product-authorization";

export const instant = false;

export default async function LifestyleEntryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/lifestyle/login");
  if (!(await hasProductPermission(session.user.id, "LIFESTYLE_OS_ACCESS"))) redirect("/products?access=denied");
  const profile = await getProfileForUser(session.user.id);
  redirect(signedInProductDestination("lifestyle", Boolean(profile?.onboardingCompleted)));
}
