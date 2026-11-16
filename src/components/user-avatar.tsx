import Image from "next/image";
import type { UserIdentity } from "@/lib/user-identity";

/**
 * The user's picture, or their initials when there is none.
 *
 * `unoptimized`: the uploaded photo is served by an authenticated route that
 * the image optimizer cannot call with the user's cookie, and provider photos
 * are already small CDN images. Width and height are always set, so nothing
 * shifts when it loads. Decorative: the name beside it carries the meaning.
 */
export default function UserAvatar({ identity, size, className }: { identity: Pick<UserIdentity, "avatarUrl" | "initials">; size: number; className?: string }) {
  const style = { width: size, height: size };
  if (identity.avatarUrl) {
    return <span className={`m-avatar m-avatar-image${className ? ` ${className}` : ""}`} style={style} aria-hidden="true">
      <Image src={identity.avatarUrl} alt="" width={size} height={size} unoptimized referrerPolicy="no-referrer" />
    </span>;
  }
  return <span className={`m-avatar${className ? ` ${className}` : ""}`} style={style} aria-hidden="true">{identity.initials}</span>;
}
