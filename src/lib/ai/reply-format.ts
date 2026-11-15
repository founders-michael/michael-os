/**
 * The small Markdown subset model replies actually use — headings, bullets,
 * numbered items and **bold** — parsed into lines so the chat can render
 * them, instead of showing the raw `**` and `#`.
 *
 * Deliberately not a Markdown renderer: no links, images or HTML, so nothing
 * in a reply (which may quote untrusted record titles) can become markup.
 * Everything is rendered as text nodes.
 */

export type ReplySegment = { text: string; bold: boolean };
export type ReplyLine =
  | { kind: "heading" | "text"; segments: ReplySegment[] }
  | { kind: "bullet"; indent: 0 | 1; segments: ReplySegment[] }
  | { kind: "numbered"; marker: string; indent: 0 | 1; segments: ReplySegment[] }
  | { kind: "blank" };

/** Splits `**bold**` runs out of a line; an unmatched `**` stays as text. */
export function inlineSegments(text: string): ReplySegment[] {
  const segments: ReplySegment[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) segments.push({ text: text.slice(last, match.index), bold: false });
    segments.push({ text: match[1]!, bold: true });
    last = match.index! + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false });
  return segments.filter((segment) => segment.text.length > 0);
}

export function parseReply(text: string): ReplyLine[] {
  const lines: ReplyLine[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      // Collapse runs of blank lines into one gap.
      if (lines.length && lines.at(-1)!.kind !== "blank") lines.push({ kind: "blank" });
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.+)$/.exec(line);
    if (heading) { lines.push({ kind: "heading", segments: inlineSegments(heading[1]!.replace(/\*\*/g, "")) }); continue; }
    const bullet = /^(\s*)[-*•]\s+(.+)$/.exec(line);
    if (bullet) { lines.push({ kind: "bullet", indent: bullet[1]!.length >= 2 ? 1 : 0, segments: inlineSegments(bullet[2]!) }); continue; }
    const numbered = /^(\s*)(\d{1,3})[.)]\s+(.+)$/.exec(line);
    if (numbered) { lines.push({ kind: "numbered", marker: `${numbered[2]}.`, indent: numbered[1]!.length >= 2 ? 1 : 0, segments: inlineSegments(numbered[3]!) }); continue; }
    lines.push({ kind: "text", segments: inlineSegments(line) });
  }
  while (lines.at(-1)?.kind === "blank") lines.pop();
  return lines;
}

/** The reply as clean text, for screen readers and copying. */
export function plainReply(lines: ReplyLine[]) {
  return lines.map((line) => {
    if (line.kind === "blank") return "";
    const text = line.segments.map((segment) => segment.text).join("");
    if (line.kind === "bullet") return `• ${text}`;
    if (line.kind === "numbered") return `${line.marker} ${text}`;
    return text;
  }).join("\n");
}
