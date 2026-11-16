import ProductAuthPage from "@/components/product-auth-page";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Sign in to LifestyleOS");

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string; error?: string }> };

export default async function LifestyleLoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <ProductAuthPage product="lifestyle" mode="login" returnTo={params.returnTo} authError={params.error} />;
}
