import ContextEditor from "@/components/settings/context-editor";
import MemoryList from "@/components/michael/memory-list";
import { getPersonalContext } from "@/lib/account-service";
import { privatePageMetadata } from "@/lib/page-metadata";
import { requireSettingsUser } from "@/lib/settings-access";
import { effectiveTimeZone } from "@/lib/time-zone";

export const metadata = privatePageMetadata("My Context");

export const instant = false;

export default async function MyContextPage() {
  const { userId, profile } = await requireSettingsUser();
  const context = await getPersonalContext(userId);
  const timeZone = effectiveTimeZone(profile.timeZone);
  return <>
    <ContextEditor initialContext={context} timeZone={timeZone} />
    <MemoryList endpoint="/api/memories" canManage owner="user" timeZone={timeZone} />
  </>;
}
