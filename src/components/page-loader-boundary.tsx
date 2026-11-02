import type { ReactNode } from "react";
import MichaelWaterLoader, { type MichaelWaterLoaderSize } from "@/components/michael-water-loader";

type PageLoaderBoundaryProps = {
  label?: string;
  size?: MichaelWaterLoaderSize;
  backdrop?: "soft" | "transparent";
  loader?: ReactNode;
};

/** Shared route fallback for LifestyleOS and WorkOS. Pass a custom loader or
 * presentation options from a route's loading.tsx when that screen needs one. */
export default function PageLoaderBoundary({
  label = "Loading page",
  size = "large",
  backdrop = "soft",
  loader,
}: PageLoaderBoundaryProps) {
  return <main className={`page-loader-boundary page-loader-${backdrop}`} aria-busy="true">
    {loader ?? <MichaelWaterLoader label={label} size={size} />}
  </main>;
}
