import ProductAuthPage from "@/components/product-auth-page";

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string }> };

export default async function LifestyleLoginPage({ searchParams }: PageProps) {
  return <ProductAuthPage product="lifestyle" mode="login" returnTo={(await searchParams).returnTo} />;
}
