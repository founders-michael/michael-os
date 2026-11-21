/**
 * Optional content any template accepts, so an email can carry more than its
 * defaults without a new template: a different opening line, extra labelled
 * facts, a highlighted note, a second link and a line above the footer. Every
 * field is optional; a template renders only what it is given.
 */
export type EmailExtras = {
  /** Replaces the default opening line ("Hi Sam, here's the reminder you set."). */
  intro?: string;
  /** Extra rows in the details panel, after the template's own. */
  details?: Array<{ label: string; value: string }>;
  /** A highlighted box under the details, e.g. a tip or what changed. */
  note?: { title?: string; text: string };
  /** A second, quieter link beside the main button. */
  secondaryAction?: { label: string; href: string };
  /** A line above the standard footer. */
  footerNote?: string;
};

/** Where the logo comes from: an inline attachment when sent, a data URI in previews, a URL once hosted. */
export type LogoSource = { kind: "cid"; contentId: string } | { kind: "src"; src: string };

/** What every template needs besides its own content. */
export type EmailBase = {
  greetingName: string | null;
  /** Settings → Notifications, for the footer's "turn these off" link. */
  settingsUrl: string;
  logo: LogoSource;
  extras?: EmailExtras;
};
