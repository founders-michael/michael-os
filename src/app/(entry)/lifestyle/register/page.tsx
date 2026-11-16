import ProductAuthPage from "@/components/product-auth-page";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Create a LifestyleOS account");

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string; error?: string }> };

export default async function LifestyleRegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <ProductAuthPage product="lifestyle" mode="register" returnTo={params.returnTo} authError={params.error} />;
}
