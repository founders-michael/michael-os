import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { auth } from "@/lib/auth";

export const instant = false;

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");
  return <AuthForm mode="login" />;
}
