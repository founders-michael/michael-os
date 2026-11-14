"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import { useMotionTokens } from "@animate-ui/react/utils/motion";

/**
 * Enter and exit animation for list items that are added or removed while the
 * user watches — a task completed, a habit checked in, a tool finishing.
 *
 * Put it directly inside the list element; it renders no DOM of its own, so
 * `<ul>` → `<li>` structure is preserved:
 *
 *   <ul className="…">
 *     <AnimatedList>{items.map((item) => <AnimatedItem as="li" key={item.id}>…</AnimatedItem>)}</AnimatedList>
 *   </ul>
 *
 * Items present on the first render do **not** animate in. That is deliberate:
 * the list is usually server-rendered, and starting server HTML at
 * `opacity: 0` would hide real content until hydration — or forever, if
 * JavaScript fails. Arrival of the page itself is the page transition's job.
 *
 * With `reflow`, removing an item pops it out of layout and lets its siblings
 * slide into the gap by transform (FLIP), instead of animating `height`, which
 * would relayout the page every frame. The list element then needs
 * `position: relative`, because the leaving item is positioned absolutely.
 */
export function AnimatedList({ reflow = false, children }: { reflow?: boolean; children: ReactNode }) {
  return <AnimatePresence initial={false} mode={reflow ? "popLayout" : "sync"}>{children}</AnimatePresence>;
}

type ItemTag = "li" | "div" | "article" | "section" | "span";

type AnimatedItemProps = Omit<HTMLMotionProps<"div">, "ref"> & {
  as?: ItemTag;
  /** Let siblings slide into place when this item moves (requires `AnimatedList reflow`). */
  reflow?: boolean;
};

export function AnimatedItem({ as = "li", reflow = false, transition, children, ...props }: AnimatedItemProps) {
  const tokens = useMotionTokens();
  const Component = motion[as] as typeof motion.div;
  return (
    <Component
      layout={reflow ? "position" : undefined}
      initial={{ opacity: 0, y: tokens.shift.handoff }}
      animate={{ opacity: 1, y: 0, transition: transition ?? tokens.transition.reveal }}
      exit={{ opacity: 0, scale: tokens.scale.choice, transition: tokens.transition.dismiss }}
      transition={{ layout: tokens.spring.reflow }}
      {...props}
    >
      {children}
    </Component>
  );
}
