import ProductAuthPage from "@/components/product-auth-page";

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string }> };

export default async function LifestyleRegisterPage({ searchParams }: PageProps) {
  return <ProductAuthPage product="lifestyle" mode="register" returnTo={(await searchParams).returnTo} />;
}
