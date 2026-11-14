"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { AnimateUIProvider } from "@animate-ui/react/provider";

/**
 * The one place motion is configured for the whole app.
 *
 * `tempo` scales every Animate UI token — springs, durations, staggers — so
 * the app keeps a single pace. Components read those tokens through
 * `useMotionTokens()` instead of hard-coding their own timings; that is what
 * "consistent motion tokens" means here, and it is why there is no second
 * token file.
 *
 * `MotionConfig reducedMotion="user"` is the part Animate UI cannot do for us.
 * Its own components already respect `prefers-reduced-motion`, but a raw
 * `motion.div` written in this codebase does not unless it sits under this
 * config. With it, transform and layout animation is dropped for users who
 * ask for reduced motion while opacity and colour still change, so a state
 * change is still communicated without movement.
 */
export const MOTION_TEMPO = 1.1;

export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <AnimateUIProvider tempo={MOTION_TEMPO}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </AnimateUIProvider>
  );
}
