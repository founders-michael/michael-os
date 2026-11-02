import InvitationAcceptance from "@/components/invitation-acceptance";

export const instant = false;
type PageProps = { searchParams: Promise<{ token?: string }> };
export default async function AcceptInvitationPage({ searchParams }: PageProps) {
  return <InvitationAcceptance initialToken={(await searchParams).token ?? ""} />;
}
