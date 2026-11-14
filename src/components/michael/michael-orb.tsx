import type { CSSProperties, Ref } from "react";
import type { PresenceMotion } from "@/components/michael/presence-motion";

export type OrbSize = "sm" | "md" | "lg" | "xl";

/** Rendered diameter for each size. The glow and rings extend past it. */
export const ORB_PIXELS: Record<OrbSize, number> = { sm: 20, md: 34, lg: 64, xl: 136 };

/**
 * The orb itself — markup only. `MichaelPresence` decides which motion it
 * plays and when it pauses; this component just draws one row of
 * `PRESENCE_MOTION`. It is always decorative: whoever renders it supplies the
 * accessible name.
 */
export default function MichaelOrb({ motion, size, paused = false, className = "", ref }: {
  motion: PresenceMotion;
  size: OrbSize;
  paused?: boolean;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
}) {
  const style = {
    "--mo-size": `${ORB_PIXELS[size]}px`,
    "--mo-core-s": `${motion.coreSeconds}s`,
    "--mo-ring-s": `${motion.ringSeconds}s`,
    "--mo-sheen-s": `${motion.sheenSeconds}s`,
    "--mo-glow": motion.glow,
  } as CSSProperties;

  return (
    <span
      ref={ref}
      className={`michael-orb ${className}`.trim()}
      data-size={size}
      data-tone={motion.tone}
      data-core={motion.core}
      data-ring={motion.ring}
      data-sheen={motion.sheenSeconds > 0 ? "on" : "off"}
      data-orbit={motion.orbit && size !== "sm" ? "on" : "off"}
      data-paused={paused ? "true" : "false"}
      style={style}
      aria-hidden="true"
    >
      <span className="mo-aura" />
      <span className="mo-ring" />
      <span className="mo-ring mo-ring-late" />
      <span className="mo-core"><span className="mo-sheen" /></span>
      {size !== "sm" && <span className="mo-orbit"><i /><i /><i /></span>}
    </span>
  );
}
