"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ErrorState } from "@/components/ux/ux-states";

export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const pathname = usePathname();
  const isWork = pathname === "/work" || pathname.startsWith("/work/");
  useEffect(() => {
    if (error.digest) console.error("Workspace page failed to render", { digest: error.digest });
  }, [error.digest]);
  return <main className="ux-page-frame"><ErrorState title={isWork ? "WorkOS couldn’t load this page" : "LifestyleOS couldn’t load this page"} description="Try loading the page again. Your saved information has not been changed." onRetry={retry} /></main>;
}
