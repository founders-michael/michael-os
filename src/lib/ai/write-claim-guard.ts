/**
 * Michael may not claim a record was saved.
 *
 * The system instruction already forbids it and a 7B local model still did it:
 * it reported "the task is added to your calendar" when no write tool existed.
 * Prose cannot enforce this, so the claim is detected and replaced after the
 * fact, in the same spirit as figure-containment — the model's wording is not
 * trusted to match what actually happened.
 *
 * A write only ever happens when the user presses Save in the chat, so at the
 * moment the model answers, nothing has been saved. Any past-tense claim that
 * it has is false by construction.
 */

import { DRAFT_LABELS, type DraftKind } from "@/lib/ai/draft-model";

/**
 * Past-tense claims of a completed write. Present and future wording ("I can
 * add", "this will create") is allowed: it describes the Save button correctly.
 */
const WRITE_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:i|i've|i have)\s+(?:just\s+|now\s+|already\s+)?(?:added|created|saved|scheduled|logged|set up|booked|put)\b/i,
  /\b(?:has|have)\s+been\s+(?:added|created|saved|scheduled|logged|booked)\b/i,
  /\bis\s+now\s+(?:added|created|saved|scheduled|on your calendar|in your (?:task|habit|goal)s?)\b/i,
  // The plain present/past passive, which is what the reported failure actually
  // said: "The task is added to your calendar." A false positive here only
  // appends a clarification that nothing is saved, whereas a miss is the defect
  // this guard exists to prevent, so the looser reading is the safer one.
  /\b(?:is|are|was|were)\s+(?:now\s+|already\s+)?(?:added|created|saved|scheduled|logged)\b/i,
  /\b(?:added|created|saved|scheduled)\s+(?:it|this|that|the\s+\w+)\s+(?:to|in|on)\s+your\b/i,
  /\byour\s+\w+\s+(?:has\s+been|was)\s+(?:added|created|saved|scheduled)\b/i,
];

export function claimsCompletedWrite(message: string): boolean {
  return WRITE_CLAIM_PATTERNS.some((pattern) => pattern.test(message));
}

export type WriteClaimReview = {
  message: string;
  /** True when a false claim was found and replaced. */
  corrected: boolean;
};

function replacement(draftKinds: DraftKind[]): string {
  if (draftKinds.length === 0) {
    return "I cannot save anything myself. Ask me to draft a task, goal, habit or calendar event and I will prepare it for you to review and save.";
  }
  const labels = [...new Set(draftKinds.map((kind) => DRAFT_LABELS[kind]))];
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
  // Deliberately phrased without a past participle of add/create/save: the
  // first draft of this sentence tripped the very patterns above, so the
  // correction would have been corrected again.
  return `I have prepared the ${list} below. Review the details and press Save to add it; until you do, it exists only in this chat.`;
}

/**
 * Rewrites a false claim rather than deleting the whole answer, so surrounding
 * explanation survives. When the claim is the entire message, the replacement
 * stands alone.
 */
export function reviewWriteClaims(message: string, draftKinds: DraftKind[]): WriteClaimReview {
  if (!claimsCompletedWrite(message)) return { message, corrected: false };

  const sentences = message.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) => !claimsCompletedWrite(sentence));
  const correction = replacement(draftKinds);

  // Every sentence made the claim, or the split produced nothing usable.
  if (kept.length === 0) return { message: correction, corrected: true };
  return { message: `${kept.join(" ").trim()} ${correction}`.trim(), corrected: true };
}
