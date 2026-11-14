"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useMotionTokens } from "@animate-ui/react/utils/motion";
import MichaelPresence from "@/components/michael/michael-presence";

/**
 * The frame for anything Michael proposes that only the user can accept — a
 * record draft awaiting Save, a schedule awaiting approval.
 *
 * While it is pending it carries the same amber beacon the presence orb uses
 * for `awaiting_approval`, so "this needs you" looks the same everywhere.
 * Once the user has saved or approved, it settles. The card's own markup and
 * its Save flow are unchanged; this only frames them.
 */
export default function MichaelActionCard({ className, label, pending, children }: {
  className: string;
  label: string;
  pending: boolean;
  children: ReactNode;
}) {
  const tokens = useMotionTokens();
  return (
    <motion.section
      className={`${className} michael-action-card`}
      aria-label={label}
      data-pending={pending ? "true" : "false"}
      initial={{ opacity: 0, y: tokens.shift.handoff, scale: tokens.scale.choice }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={tokens.transition.panelIn}
    >
      {pending && <MichaelPresence className="michael-action-card-beacon" state="awaiting_approval" size="sm" />}
      {children}
    </motion.section>
  );
}
