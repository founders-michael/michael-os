import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProductSelection from "@/components/product-selection";
import { auth } from "@/lib/auth";

export const instant = false;

export default async function ProductSwitchPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  return <ProductSelection authenticatedName={session.user.name || undefined} />;
}
