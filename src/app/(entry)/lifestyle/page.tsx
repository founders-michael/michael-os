import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProfileForUser } from "@/lib/profile-service";
import { signedInProductDestination } from "@/lib/product-entry";

export const instant = false;

export default async function LifestyleEntryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/lifestyle/login");
  const profile = await getProfileForUser(session.user.id);
  redirect(signedInProductDestination("lifestyle", Boolean(profile?.onboardingCompleted)));
}
