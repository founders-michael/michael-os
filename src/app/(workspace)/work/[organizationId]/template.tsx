import type { ReactNode } from "react";
import PageTransition from "@/components/motion/page-transition";

/**
 * WorkOS is the professional, data-dense side of the product, so moving
 * between its sections crossfades without the rise the personal workspace
 * uses. Same mechanism as the workspace template; see `PageTransition`.
 */
export default function OrganizationTemplate({ children }: { children: ReactNode }) {
  return <PageTransition variant="quiet">{children}</PageTransition>;
}
