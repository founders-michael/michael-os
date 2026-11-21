/**
 * The look of every MichaelOS email, in one place. Change a colour, font,
 * corner radius or label here and every template follows.
 *
 * Email clients cannot read the app's CSS variables, so these are the light
 * theme's literal values (michael-theme.css). This file and the templates it
 * styles are the only places in the app where colours are written as hex.
 */
export const emailTheme = {
  brand: "MichaelOS",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  colors: {
    page: "#F5F7FA",
    card: "#FFFFFF",
    text: "#0B1220",
    muted: "#526071",
    faint: "#5F6B7B",
    border: "#E3E8EE",
    panel: "#F7FAF9",
    onAccent: "#FFFFFF",
    track: "#E8EDF2",
  },
  radius: { card: 16, button: 10, panel: 12 },
  /** The logo at the top of every email: 440×86 source shown at 220×43 (sharp on high-density screens). */
  logo: { file: "michael-logo.png", width: 220, height: 43, alt: "Michael" },
  /** Each kind of email has its own accent and kicker, so a glance tells you what it is about. */
  kinds: {
    task: { accent: "#047857", tint: "#ECFDF5", kicker: "TASK REMINDER" },
    goal: { accent: "#1D4ED8", tint: "#EFF6FF", kicker: "GOAL CHECK-IN" },
    habit: { accent: "#B45309", tint: "#FFF7ED", kicker: "HABIT NUDGE" },
  },
} as const;

export type EmailKind = keyof typeof emailTheme.kinds;
