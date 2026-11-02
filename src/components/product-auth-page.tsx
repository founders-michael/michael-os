import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { auth } from "@/lib/auth";
import { safeInvitationReturnTo } from "@/lib/auth-return-to";
import { getProfileForUser } from "@/lib/profile-service";
import {
  productAuthDestination,
  signedInProductDestination,
  type AuthMode,
  type ProductExperience,
} from "@/lib/product-entry";

export default async function ProductAuthPage({
  product,
  mode,
  returnTo: candidateReturnTo,
}: {
  product: ProductExperience;
  mode: AuthMode;
  returnTo?: string;
}) {
  const returnTo = safeInvitationReturnTo(candidateReturnTo);
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    if (returnTo) redirect(returnTo);
    if (product === "work") redirect(signedInProductDestination("work"));
    const profile = await getProfileForUser(session.user.id);
    redirect(signedInProductDestination("lifestyle", Boolean(profile?.onboardingCompleted)));
  }

  return <AuthForm
    mode={mode}
    product={product}
    returnTo={returnTo}
    defaultDestination={productAuthDestination(product, mode)}
  />;
}
