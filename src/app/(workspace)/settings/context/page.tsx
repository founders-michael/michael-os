import ContextEditor from "@/components/settings/context-editor";
import { getPersonalContext } from "@/lib/account-service";
import { privatePageMetadata } from "@/lib/page-metadata";
import { requireSettingsUser } from "@/lib/settings-access";
import { effectiveTimeZone } from "@/lib/time-zone";

export const metadata = privatePageMetadata("My Context");

export const instant = false;

export default async function MyContextPage() {
  const { userId, profile } = await requireSettingsUser();
  const context = await getPersonalContext(userId);
  return <ContextEditor initialContext={context} timeZone={effectiveTimeZone(profile.timeZone)} />;
}
