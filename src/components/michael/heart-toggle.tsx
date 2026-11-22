"use client";

/**
 * The heart beside "What matters to you" on Home: tap to fill it, tap again to
 * empty it. A small personal gesture, not data: it is remembered in this
 * browser only (localStorage, guarded, so a blocked or private store just
 * means it starts empty), never sent to the server or Michael. Read through
 * useSyncExternalStore so the server render (empty) and the browser agree.
 */
import { useState, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";

const STORAGE_KEY = "michaelos:home-heart";
const CHANGE_EVENT = "michaelos:home-heart-change";

// Used when storage is blocked: the heart still toggles for this visit, it just isn't remembered.
let memoryValue = false;

function read() {
  try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch { return memoryValue; }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(CHANGE_EVENT, onChange); };
}

export default function HeartToggle({ label }: { label: string }) {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const [popped, setPopped] = useState(false);

  function toggle() {
    const next = !on;
    setPopped(next);
    memoryValue = next;
    try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* storage unavailable: memoryValue carries it */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return <button type="button" className={`m-heart-toggle${on ? " m-on" : ""}`} aria-pressed={on} aria-label={on ? `Unlike ${label}` : `Like ${label}`} onClick={toggle}>
    <Heart size={14} aria-hidden="true" fill={on ? "currentColor" : "none"} className={popped && on ? "motion-pop" : undefined} onAnimationEnd={() => setPopped(false)} />
  </button>;
}
