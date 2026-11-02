import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/request-user-context";
import { prisma } from "@/lib/prisma";

export const instant = false;
type LayoutProps = Readonly<{ children: React.ReactNode; params: Promise<{ organizationId: string }> }>;

export default async function OrganizationLayout({ children, params }: LayoutProps) {
  const session = await getRequestSession();
  if (!session) redirect("/work/login");
  const { organizationId } = await params;
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, userId: session.user.id, status: "ACTIVE", organization: { policy: { isNot: null } } },
    select: { id: true },
  });
  if (!membership) redirect("/work");
  return children;
}
