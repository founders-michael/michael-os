import AccountSettings from "@/components/settings/account-settings";
import { getAccount } from "@/lib/account-service";
import { privatePageMetadata } from "@/lib/page-metadata";
import { requireSettingsUser } from "@/lib/settings-access";

export const metadata = privatePageMetadata("Account settings");

export const instant = false;

export default async function AccountSettingsPage() {
  const { userId } = await requireSettingsUser();
  const account = await getAccount(userId);
  return <AccountSettings initialAccount={account} />;
}
