import type { ReactNode } from "react";
import PageTransition from "@/components/motion/page-transition";

/**
 * Remounts on each change of the first segment under the workspace (Today →
 * Tasks → Habits …), which is what lets the page transition run enter and
 * exit. Next gives a template the same per-segment key it already uses to
 * remount that segment's loading boundary, so this adds no remount that was
 * not already happening. Search-param navigations such as `/?date=…` keep the
 * key and do not animate.
 *
 * Deeper navigations inside WorkOS (`/work/[organizationId]/…`) keep this key
 * too; that segment has its own, quieter template.
 */
export default function WorkspaceTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
