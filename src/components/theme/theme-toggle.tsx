"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, currentTheme, saveTheme, savedTheme } from "@/lib/theme";

/**
 * Switches between the light and dark themes. Both labels are rendered and CSS
 * shows the one for the other theme, so the server markup never depends on a
 * theme only the browser knows (no hydration mismatch, no flash).
 */
export default function ThemeToggle() {
  // Without a saved choice, keep following the system while the page is open.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => { if (!savedTheme()) applyTheme(media.matches ? "dark" : "light"); };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    saveTheme(next);
  }

  return <button type="button" className="m-btn m-btn-sm m-theme-toggle" onClick={toggle}>
    <span className="m-theme-to-light"><Sun size={16} aria-hidden="true" /> Light<span className="sr-only"> theme</span></span>
    <span className="m-theme-to-dark"><Moon size={16} aria-hidden="true" /> Dark<span className="sr-only"> theme</span></span>
  </button>;
}
