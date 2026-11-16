"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirmation } from "@/components/ux/confirmation-provider";

/**
 * Keeps unsaved edits from being lost by accident.
 *
 * - Closing or reloading the tab: the browser's own "leave site?" prompt.
 * - Clicking a link inside the app: the app's confirmation dialog first. The
 *   listener runs on `window` in the capture phase, before Next's Link and the
 *   shell's navigation indicator, and they both skip a prevented click.
 *
 * Browser back/forward is not intercepted: the App Router offers no way to
 * block it without breaking history.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const confirm = useConfirmation();
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function interceptLink(event: MouseEvent) {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      event.preventDefault();
      event.stopPropagation();
      void confirm({
        title: "Leave without saving?",
        description: "Your changes on this page haven't been saved and will be lost.",
        confirmLabel: "Leave page",
        destructive: true,
      }, () => {
        dirtyRef.current = false;
        router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("click", interceptLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("click", interceptLink, true);
    };
  }, [dirty, confirm, router]);
}
