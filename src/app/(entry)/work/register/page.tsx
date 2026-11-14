import ProductAuthPage from "@/components/product-auth-page";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Create a WorkOS account");

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string }> };

export default async function WorkRegisterPage({ searchParams }: PageProps) {
  return <ProductAuthPage product="work" mode="register" returnTo={(await searchParams).returnTo} />;
}
