import { redirect } from "next/navigation";
import OrganizationLanding from "@/components/organization-landing";
import { getRequestSession } from "@/lib/request-user-context";

export const instant = false;

export default function WorkLandingPage() {
  return <WorkLanding />;
}

async function WorkLanding() {
  const session = await getRequestSession();
  if (!session) redirect("/work/login");
  return <OrganizationLanding />;
}
