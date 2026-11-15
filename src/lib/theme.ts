/**
 * Colour theme. The class (m-dark / m-light) lives on <html> and is applied by
 * THEME_BOOT_SCRIPT before first paint, so a saved dark theme never flashes
 * light. With nothing saved the theme follows the system and keeps following
 * it; pressing the toggle saves an explicit choice.
 */
export type ColourTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "michael-theme";

export function themeClass(theme: ColourTheme) {
  return theme === "dark" ? "m-dark" : "m-light";
}

/** Inlined in <head>. Kept tiny and dependency-free; storage may throw in private windows. */
export const THEME_BOOT_SCRIPT = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="dark"&&t!=="light"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.classList.remove("m-dark","m-light");d.classList.add(t==="dark"?"m-dark":"m-light")})()`;

export function currentTheme(): ColourTheme {
  return document.documentElement.classList.contains("m-dark") ? "dark" : "light";
}

export function applyTheme(theme: ColourTheme) {
  const root = document.documentElement;
  root.classList.remove("m-dark", "m-light");
  root.classList.add(themeClass(theme));
}

export function saveTheme(theme: ColourTheme) {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* storage unavailable: the choice lasts this page only */ }
}

export function savedTheme(): ColourTheme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch { return null; }
}
