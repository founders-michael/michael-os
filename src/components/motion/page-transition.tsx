import { ViewTransition, type ReactNode } from "react";

/**
 * Crossfades page content when the route changes.
 *
 * Built on React's `<ViewTransition>` rather than a JavaScript animation
 * library, as the Next.js guide for this version recommends: route navigations
 * are already React transitions, so the browser's View Transitions API animates
 * between composited snapshots of the old and new content. That gives an exit
 * animation — which `AnimatePresence` cannot do under the App Router, because
 * the old page is gone before it could animate out — at no per-frame JavaScript
 * cost, and with no layout shift, since the live DOM is never moved.
 *
 * Only the content inside this boundary animates. React leaves the root
 * unnamed when a boundary like this one is active, so the sidebar and topbar
 * stay perfectly still instead of crossfading with the page.
 *
 * `default="none"` matters: `router.refresh()` is also a transition, and
 * without it every refresh — completing a task, saving a habit — would
 * crossfade the whole page. Only mounting (enter) and unmounting (exit)
 * animate. Browsers without the API simply swap the content, as before.
 *
 * Use it from a `template.tsx`, whose subtree remounts on each navigation,
 * not from a layout: a layout persists, so enter and exit would never fire.
 */
export default function PageTransition({ variant = "page", children }: {
  /** "page" adds a short rise; "quiet" is a pure crossfade for dense screens. */
  variant?: "page" | "quiet";
  children: ReactNode;
}) {
  return (
    <ViewTransition
      enter={variant === "page" ? "page-enter" : "page-enter-quiet"}
      exit="page-exit"
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
