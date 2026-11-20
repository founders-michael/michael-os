import AccountSettings from "@/components/settings/account-settings";
import DeleteAccountSection from "@/components/settings/delete-account-section";
import { getAccount, getAccountDeletionStatus } from "@/lib/account-service";
import { privatePageMetadata } from "@/lib/page-metadata";
import { requireSettingsUser } from "@/lib/settings-access";

export const metadata = privatePageMetadata("Account settings");

export const instant = false;

export default async function AccountSettingsPage({ searchParams }: { searchParams: Promise<{ confirmDelete?: string }> }) {
  const { userId } = await requireSettingsUser();
  const [account, deletion, params] = await Promise.all([getAccount(userId), getAccountDeletionStatus(userId), searchParams]);
  return <>
    <AccountSettings initialAccount={account} />
    {/* `confirmDelete=1` is where a provider sign-in returns: it only reopens the panel; the server still decides. */}
    <DeleteAccountSection status={deletion} email={account.email} reconfirmed={params.confirmDelete === "1"} />
  </>;
}
