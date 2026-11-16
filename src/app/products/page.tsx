import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProductSelection from "@/components/product-selection";
import { auth } from "@/lib/auth";
import { getUserProductPermissions } from "@/lib/product-authorization";
import { productExperiencesForPermissions } from "@/lib/product-permission-policy";
import { privatePageMetadata } from "@/lib/page-metadata";
import { getUserIdentity } from "@/lib/account-service";

export const metadata = privatePageMetadata("Choose a product");

export const instant = false;

export default async function ProductSwitchPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const [permissions, identity] = await Promise.all([getUserProductPermissions(session.user.id), getUserIdentity(session.user.id)]);
  return <ProductSelection
    authenticated
    authenticatedName={identity.nameSource === "generic" ? undefined : identity.greetingName}
    availableProducts={productExperiencesForPermissions(permissions)}
    accessDenied={(await searchParams).access === "denied"}
  />;
}
