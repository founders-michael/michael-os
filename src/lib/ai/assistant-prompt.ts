/**
 * The `prompt` query parameter the Ask Michael launcher passes to the
 * assistant.
 *
 * It arrives from the URL, so it is untrusted: a crafted link could otherwise
 * drop arbitrary text into someone's composer. It is never sent on its own —
 * it only prefills the input, and the user presses Send — but it is still
 * bounded and stripped of control characters so a long or line-broken value
 * cannot distort the composer or smuggle framing across visual lines.
 */
const MAX_PROMPT_LENGTH = 400;

export function sanitizeAssistantPrompt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    // Collapse every control character and line break into a single space:
    // the launcher is a one-line input, so newlines can only come from a
    // hand-edited URL.
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PROMPT_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}
