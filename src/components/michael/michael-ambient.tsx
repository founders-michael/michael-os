"use client";

import dynamic from "next/dynamic";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";

// Client-only and split out: the shader never runs on the server, and its code
// is not part of the page's initial JavaScript.
const Aurora = dynamic(() => import("@/components/michael/aurora"), { ssr: false });

/** Sage tones from the app palette; light mode caps their lightness. */
const AURORA_STOPS = ["#a9cfa0", "#6fa88a", "#c7dfb8"];

/**
 * The ambient light behind Michael on Home — React Bits' Aurora, kept quiet.
 *
 * It is the one continuously rendered effect in the app, so it is bounded:
 *  - only on Home, behind the hero, never full-page and never in WorkOS;
 *  - rendered at 1 device pixel per CSS pixel — it is a soft gradient, so
 *    retina resolution would quadruple the work for no visible gain;
 *  - Aurora itself stops drawing while the tab is hidden or the hero is
 *    scrolled away;
 *  - under reduced motion it draws one still frame and stops. (Aurora alone
 *    freezes its clock but keeps redrawing the same frame every display
 *    refresh; `paused` is what actually stops the loop.)
 *
 * If WebGL 2 is unavailable it draws nothing, and the hero's own gradient
 * background is what shows.
 */
export default function MichaelAmbient({ className = "" }: { className?: string }) {
  const reduceMotion = useShouldReduceMotion();
  return (
    <div className={`michael-ambient ${className}`.trim()} aria-hidden="true">
      <Aurora
        colorStops={AURORA_STOPS}
        lightMode
        amplitude={0.9}
        blend={0.7}
        speed={0.35}
        height={0.55}
        opacity={0.65}
        dpr={1}
        paused={reduceMotion}
        intro={!reduceMotion}
        mouseInteraction={!reduceMotion}
      />
    </div>
  );
}
