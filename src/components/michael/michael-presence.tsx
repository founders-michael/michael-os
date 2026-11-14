"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { usePageVisible } from "@animate-ui/react/utils/use-page-visible";
import MichaelOrb, { type OrbSize } from "@/components/michael/michael-orb";
import { PRESENCE_MOTION } from "@/components/michael/presence-motion";
import { presenceDescription, type PresenceState } from "@/lib/ai/assistant-presence";

/**
 * Michael's visual identity: one orb, in every place Michael appears, whose
 * motion says what Michael is doing.
 *
 * `state` must come from `presenceStateFor` (or be a fixed `idle`/`listening`
 * where no turn can be in flight). Never pick a state for effect — an orb that
 * "thinks" while nothing is happening is exactly the fabrication this
 * component exists to avoid.
 *
 * Cost control. The loops are compositor-only CSS animations, and they pause
 * whenever nobody can see them: when the tab is hidden, and when the orb is
 * scrolled out of view. Under `prefers-reduced-motion` the stylesheet stops
 * every loop and holds a still pose that is distinct for each state — colour,
 * ring and dots still tell them apart without movement.
 *
 * Accessibility. Pass `label` when nothing next to the orb says what Michael
 * is doing; it becomes the accessible name (defaulting to a description of the
 * state when `label` is `true`). Without it the orb is hidden from assistive
 * technology, because the surrounding text already carries the meaning and a
 * second announcement would be noise.
 */
export default function MichaelPresence({ state, size = "md", label, className = "" }: {
  state: PresenceState;
  size?: OrbSize;
  label?: string | true;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const pageVisible = usePageVisible();
  const onScreen = useOnScreen(ref);
  const accessibleName = label === true ? presenceDescription(state) : label;

  return (
    <span
      className={`michael-presence ${className}`.trim()}
      data-state={state}
      {...(accessibleName ? { role: "img", "aria-label": accessibleName } : { "aria-hidden": true })}
    >
      <MichaelOrb ref={ref} motion={PRESENCE_MOTION[state]} size={size} paused={!pageVisible || !onScreen} />
    </span>
  );
}

/**
 * Whether the element is within 64px of the viewport.
 *
 * Starts `true`, so an orb on screen at first paint animates at once, and the
 * observer's first callback — which always reports the current state — turns
 * it off for an orb that starts out of view. Motion's `useInView` cannot be
 * used here: it only flips on enter and on leave, so with an initial value of
 * `true` an orb that starts offscreen never enters, never leaves, and is never
 * paused.
 */
function useOnScreen(ref: RefObject<Element | null>) {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true), { rootMargin: "64px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return onScreen;
}
