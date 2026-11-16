import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { auth } from "@/lib/auth";
import { safeInvitationReturnTo } from "@/lib/auth-return-to";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Sign in");

export const instant = false;

type PageProps = { searchParams: Promise<{ returnTo?: string; error?: string }> };
export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const returnTo = safeInvitationReturnTo(params.returnTo);
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(returnTo ?? "/");
  if (!returnTo) redirect("/");
  return <AuthForm mode="login" product="work" returnTo={returnTo} verificationError={params.error} />;
}
