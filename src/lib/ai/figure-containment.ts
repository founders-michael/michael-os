/**
 * Enforces W7's governing rule: Michael interprets numbers he did not compute.
 *
 * Every figure in an assistant response must appear in a tool result. This
 * module extracts the figures from both sides and reports any the model
 * produced on its own — a calculated average, a rounded percentage, a summed
 * total — which are exactly the failures that make a risk score untrustworthy.
 *
 * Pure, so it is unit-testable and can also guard a response at runtime.
 */

/** Dates are compared as text; everything else as a number. */
export type Figure = { kind: "number"; value: number } | { kind: "date"; value: string };

const DATE_PATTERN = /\d{4}-\d{2}-\d{2}/g;
// Numbers, optionally signed, with optional decimals and thousands separators.
const NUMBER_PATTERN = /-?\d+(?:,\d{3})*(?:\.\d+)?/g;

function normaliseNumber(raw: string) {
  return Number(raw.replaceAll(",", ""));
}

/** Figures stated in prose. Dates are taken first so their parts aren't split. */
export function extractFigures(text: string): Figure[] {
  const figures: Figure[] = [];
  const dates = text.match(DATE_PATTERN) ?? [];
  for (const date of dates) figures.push({ kind: "date", value: date });
  const withoutDates = text.replaceAll(DATE_PATTERN, " ");
  for (const match of withoutDates.match(NUMBER_PATTERN) ?? []) {
    const value = normaliseNumber(match);
    if (Number.isFinite(value)) figures.push({ kind: "number", value });
  }
  return figures;
}

/** Every number and date-shaped string anywhere in a tool result. */
export function collectToolFigures(value: unknown, seen = new Set<unknown>()): Figure[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "number") return Number.isFinite(value) ? [{ kind: "number", value }] : [];
  if (typeof value === "boolean") return [];
  if (typeof value === "string") {
    const figures: Figure[] = [];
    for (const date of value.match(DATE_PATTERN) ?? []) figures.push({ kind: "date", value: date });
    // A string may also carry a number, e.g. an ISO instant or "12h 30m".
    const withoutDates = value.replaceAll(DATE_PATTERN, " ");
    for (const match of withoutDates.match(NUMBER_PATTERN) ?? []) {
      const parsed = normaliseNumber(match);
      if (Number.isFinite(parsed)) figures.push({ kind: "number", value: parsed });
    }
    return figures;
  }
  if (typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((entry) => collectToolFigures(entry, seen));
  return Object.values(value as Record<string, unknown>).flatMap((entry) => collectToolFigures(entry, seen));
}

export type ContainmentResult = {
  contained: boolean;
  /** Figures the model stated that no tool result supports. */
  uncontained: Figure[];
  checkedFigureCount: number;
};

/**
 * Figures the model may state without a tool result. Deliberately tiny: these
 * are discourse numbers, not metrics. Anything else must be retrieved.
 */
const DISCOURSE_NUMBERS = new Set([0, 1, 2, 3]);

export function checkFigureContainment(
  responseText: string,
  toolResults: readonly unknown[],
  options: { allowDiscourseNumbers?: boolean } = {},
): ContainmentResult {
  const allowed = new Set<number>();
  const allowedDates = new Set<string>();
  for (const figure of toolResults.flatMap((result) => collectToolFigures(result))) {
    if (figure.kind === "number") allowed.add(figure.value);
    else allowedDates.add(figure.value);
  }

  const stated = extractFigures(responseText);
  const uncontained = stated.filter((figure) => {
    if (figure.kind === "date") return !allowedDates.has(figure.value);
    if (allowed.has(figure.value)) return false;
    // A tool-reported minute count may legitimately be spoken as hours only if
    // the hour value itself is also present; it is not derived here.
    return !(options.allowDiscourseNumbers !== false && DISCOURSE_NUMBERS.has(figure.value));
  });

  return { contained: uncontained.length === 0, uncontained, checkedFigureCount: stated.length };
}

/** Human-readable failure, for a test assertion or a server-side log. */
export function describeContainmentFailure(result: ContainmentResult) {
  if (result.contained) return "";
  const figures = result.uncontained.map((figure) => (figure.kind === "date" ? figure.value : String(figure.value)));
  return `Response stated ${result.uncontained.length} figure(s) absent from every tool result: ${figures.join(", ")}`;
}
