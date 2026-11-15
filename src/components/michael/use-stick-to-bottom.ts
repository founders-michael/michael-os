"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";

/** How close to the end still counts as "at the bottom". */
const PINNED_THRESHOLD_PX = 72;

/**
 * Keeps a chat transcript scrolled to its newest content — but only while the
 * reader is already there. Someone who has scrolled up to reread an earlier
 * answer is not dragged back down when the next progress line arrives.
 *
 * `scrollToEnd(force)` scrolls regardless, for moments the user caused: they
 * just sent a message, or opened a conversation.
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>) {
  const pinned = useRef(true);
  const reduceMotion = useShouldReduceMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < PINNED_THRESHOLD_PX;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [ref]);

  return useCallback((options?: { force?: boolean; instant?: boolean }) => {
    if (!options?.force && !pinned.current) return;
    pinned.current = true;
    requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) return;
      const behavior = options?.instant || reduceMotion ? "auto" : "smooth";
      element.scrollTo({ top: element.scrollHeight, behavior });
      // A forced jump is the user's own action, so the transcript itself must
      // be on screen too — on a narrow screen the page may have scrolled it away.
      if (options?.force) element.scrollIntoView({ block: "nearest", behavior });
    });
  }, [ref, reduceMotion]);
}
