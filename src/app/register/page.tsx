import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { auth } from "@/lib/auth";
import { safeInvitationReturnTo } from "@/lib/auth-return-to";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Create an account");

export const instant = false;

type PageProps = { searchParams: Promise<{ returnTo?: string }> };
export default async function RegisterPage({ searchParams }: PageProps) {
  const returnTo = safeInvitationReturnTo((await searchParams).returnTo);
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(returnTo ?? "/");
  if (!returnTo) redirect("/");
  return <AuthForm mode="register" product="work" returnTo={returnTo} />;
}
