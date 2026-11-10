import CapacityManager from "@/components/capacity-manager";

export const instant = false;

export default async function CapacityPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <CapacityManager key={organizationId} organizationId={organizationId} />;
}
