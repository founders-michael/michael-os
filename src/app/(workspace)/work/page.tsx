import { redirect } from "next/navigation";
import OrganizationLanding from "@/components/organization-landing";
import { getRequestSession } from "@/lib/request-user-context";
import { hasProductPermission } from "@/lib/product-authorization";

export const instant = false;

export default function WorkLandingPage() {
  return <WorkLanding />;
}

async function WorkLanding() {
  const session = await getRequestSession();
  if (!session) redirect("/work/login");
  if (!(await hasProductPermission(session.user.id, "WORK_OS_ACCESS"))) redirect("/products?access=denied");
  return <OrganizationLanding />;
}
