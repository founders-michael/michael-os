import { z } from "zod";

/** Long enough for a few paragraphs about yourself; small enough to send to Michael whole. */
export const PERSONAL_CONTEXT_MAX_CHARS = 5000;

const personName = (label: string) => z.string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, `Add ${label}.`).max(80, `Keep ${label} to 80 characters.`));

/**
 * Account details the user may change. Email is absent on purpose: changing
 * it needs re-verification, which this app does not offer yet. The user's
 * identity comes from the session, never from this body.
 */
export const accountUpdateSchema = z.object({
  fullName: personName("your full name"),
  preferredName: personName("what Michael should call you"),
}).strict();
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

/** Windows line endings become \n so the count the user sees is the count stored. */
export function normalizePersonalContext(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
}

export const personalContextUpdateSchema = z.object({
  summary: z.string()
    .transform(normalizePersonalContext)
    .pipe(z.string().max(PERSONAL_CONTEXT_MAX_CHARS, `Keep your context to ${PERSONAL_CONTEXT_MAX_CHARS.toLocaleString("en-US")} characters.`)),
  /**
   * When the context was last saved, as the editor loaded it (null if never).
   * A mismatch means it changed elsewhere since — another tab or device — and
   * the save is refused rather than silently replacing that newer text.
   */
  expectedUpdatedAt: z.iso.datetime().nullable(),
}).strict();
export type PersonalContextUpdateInput = z.infer<typeof personalContextUpdateSchema>;
