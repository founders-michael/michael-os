import ProductAuthPage from "@/components/product-auth-page";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Create a WorkOS account");

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string; error?: string }> };

export default async function WorkRegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <ProductAuthPage product="work" mode="register" returnTo={params.returnTo} authError={params.error} />;
}
