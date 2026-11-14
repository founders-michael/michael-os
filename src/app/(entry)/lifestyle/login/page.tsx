import ProductAuthPage from "@/components/product-auth-page";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Sign in to LifestyleOS");

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string }> };

export default async function LifestyleLoginPage({ searchParams }: PageProps) {
  return <ProductAuthPage product="lifestyle" mode="login" returnTo={(await searchParams).returnTo} />;
}
