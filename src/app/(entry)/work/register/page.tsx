import ProductAuthPage from "@/components/product-auth-page";

export const instant = false;
type PageProps = { searchParams: Promise<{ returnTo?: string }> };

export default async function WorkRegisterPage({ searchParams }: PageProps) {
  return <ProductAuthPage product="work" mode="register" returnTo={(await searchParams).returnTo} />;
}
