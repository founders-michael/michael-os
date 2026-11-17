"""Michael may not claim a record was saved.

The only implementation (the TypeScript one was removed in Phase 2). At the moment Michael replies nothing
has been saved — only the user's Save button writes — so any past-tense claim
that something was is false and is replaced. Patterns are ASCII-mode to match
JavaScript's `\\b`, `\\w` and case-insensitivity; `\\s` is JavaScript's set.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.orchestration.text import JS_WHITESPACE, js_trim

S = f"[{JS_WHITESPACE}]"
_FLAGS = re.IGNORECASE | re.ASCII

WRITE_CLAIM_PATTERNS = [
    re.compile(rf"\b(?:i|i've|i have){S}+(?:just{S}+|now{S}+|already{S}+)?(?:added|created|saved|scheduled|logged|set up|booked|put)\b", _FLAGS),
    re.compile(rf"\b(?:has|have){S}+been{S}+(?:added|created|saved|scheduled|logged|booked)\b", _FLAGS),
    re.compile(rf"\bis{S}+now{S}+(?:added|created|saved|scheduled|on your calendar|in your (?:task|habit|goal)s?)\b", _FLAGS),
    re.compile(rf"\b(?:is|are|was|were){S}+(?:now{S}+|already{S}+)?(?:added|created|saved|scheduled|logged)\b", _FLAGS),
    re.compile(rf"\b(?:added|created|saved|scheduled){S}+(?:it|this|that|the{S}+\w+){S}+(?:to|in|on){S}+your\b", _FLAGS),
    re.compile(rf"\byour{S}+\w+{S}+(?:has{S}+been|was){S}+(?:added|created|saved|scheduled)\b", _FLAGS),
]
_SENTENCE_SPLIT = re.compile(rf"(?<=[.!?]){S}+")

DRAFT_LABELS = {"task": "task", "goal": "goal", "habit": "habit", "calendarEvent": "calendar event"}


@dataclass(frozen=True)
class WriteClaimReview:
    message: str
    corrected: bool


def claims_completed_write(message: str) -> bool:
    return any(pattern.search(message) for pattern in WRITE_CLAIM_PATTERNS)


def _replacement(draft_kinds: list[str]) -> str:
    if not draft_kinds:
        return "I cannot save anything myself. Ask me to draft a task, goal, habit or calendar event and I will prepare it for you to review and save."
    labels = list(dict.fromkeys(DRAFT_LABELS[kind] for kind in draft_kinds))
    listed = labels[0] if len(labels) == 1 else f"{', '.join(labels[:-1])} and {labels[-1]}"
    return f"I have prepared the {listed} below. Review the details and press Save to add it; until you do, it exists only in this chat."


def review_write_claims(message: str, draft_kinds: list[str]) -> WriteClaimReview:
    if not claims_completed_write(message):
        return WriteClaimReview(message, False)
    kept = [sentence for sentence in _SENTENCE_SPLIT.split(message) if not claims_completed_write(sentence)]
    correction = _replacement(draft_kinds)
    if not kept:
        return WriteClaimReview(correction, True)
    return WriteClaimReview(js_trim(f"{js_trim(' '.join(kept))} {correction}"), True)
