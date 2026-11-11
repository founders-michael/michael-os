import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProductSelection from "@/components/product-selection";
import { auth } from "@/lib/auth";
import { getUserProductPermissions } from "@/lib/product-authorization";
import { productExperiencesForPermissions } from "@/lib/product-permission-policy";

export const instant = false;

export default async function ProductSwitchPage({ searchParams }: { searchParams: Promise<{ access?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const permissions = await getUserProductPermissions(session.user.id);
  return <ProductSelection
    authenticated
    authenticatedName={session.user.name || undefined}
    availableProducts={productExperiencesForPermissions(permissions)}
    accessDenied={(await searchParams).access === "denied"}
  />;
}
