import ProductAuthPage from "@/components/product-auth-page";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Sign in to WorkOS");

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string; error?: string }> };

export default async function WorkLoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <ProductAuthPage product="work" mode="login" returnTo={params.returnTo} authError={params.error} />;
}
