import InvitationAcceptance from "@/components/invitation-acceptance";
import { privatePageMetadata } from "@/lib/page-metadata";

export const metadata = privatePageMetadata("Accept invitation");

export const instant = false;
type PageProps = { searchParams: Promise<{ token?: string }> };
export default async function AcceptInvitationPage({ searchParams }: PageProps) {
  return <InvitationAcceptance initialToken={(await searchParams).token ?? ""} />;
}
