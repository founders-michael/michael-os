import type { PresenceState } from "@/lib/ai/assistant-presence";

/**
 * The animation for each presence state, as data.
 *
 * Every loop here is a CSS animation of `scale`, `translate`, `rotate` or
 * `opacity` — properties the browser animates on the compositor, so an orb
 * left running costs no JavaScript per frame and no layout. The component
 * turns one row of this table into data attributes and custom properties;
 * `michael.css` holds the matching keyframes. Tuning a state means editing
 * its row, not hunting through stylesheets.
 *
 * The design language, so new states stay coherent:
 *  - the core's rhythm is how busy Michael is: slow breath when idle, a quick
 *    pulse while a tool runs;
 *  - rings face outward toward the user: ripples while listening, a steady
 *    beacon when the user's approval is needed;
 *  - orbiting dots mean the model is working something out;
 *  - tone is colour: greens for normal work, amber where the user must act,
 *    the app's destructive red for a failure. Colour is never the only
 *    signal — every state also differs in motion or shape, and in its label.
 */

export type PresenceTone = "calm" | "attentive" | "focused" | "working" | "bright" | "approval" | "error";
export type CoreMotion = "breathe" | "lift" | "pulse" | "wave" | "shake";
export type RingMotion = "none" | "ripple" | "pulse" | "beacon" | "steady";

export type PresenceMotion = {
  tone: PresenceTone;
  /** The body of the orb. `shake` plays once; the others loop. */
  core: CoreMotion;
  coreSeconds: number;
  ring: RingMotion;
  ringSeconds: number;
  /** Period of the highlight's rotation; 0 holds it still. */
  sheenSeconds: number;
  /** Three dots circling the orb. Hidden at the smallest size. */
  orbit: boolean;
  /** Strength of the surrounding glow, 0–1. */
  glow: number;
};

export const PRESENCE_MOTION: Record<PresenceState, PresenceMotion> = {
  idle: { tone: "calm", core: "breathe", coreSeconds: 5.2, ring: "none", ringSeconds: 0, sheenSeconds: 22, orbit: false, glow: 0.35 },
  listening: { tone: "attentive", core: "lift", coreSeconds: 2.4, ring: "ripple", ringSeconds: 2.2, sheenSeconds: 14, orbit: false, glow: 0.55 },
  thinking: { tone: "focused", core: "breathe", coreSeconds: 2.6, ring: "none", ringSeconds: 0, sheenSeconds: 6, orbit: true, glow: 0.5 },
  executing: { tone: "working", core: "pulse", coreSeconds: 1.2, ring: "pulse", ringSeconds: 1.2, sheenSeconds: 3.2, orbit: false, glow: 0.65 },
  responding: { tone: "bright", core: "wave", coreSeconds: 1.6, ring: "none", ringSeconds: 0, sheenSeconds: 9, orbit: false, glow: 0.6 },
  awaiting_approval: { tone: "approval", core: "breathe", coreSeconds: 3.6, ring: "beacon", ringSeconds: 2.8, sheenSeconds: 18, orbit: false, glow: 0.45 },
  error: { tone: "error", core: "shake", coreSeconds: 0.5, ring: "steady", ringSeconds: 0, sheenSeconds: 0, orbit: false, glow: 0.3 },
};
