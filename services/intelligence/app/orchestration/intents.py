"""Questions the engine answers with a fixed tool, whatever the model would pick.

Phase 5–6. A small model sometimes reaches for the wrong tool (a task list
instead of the ranking, the daily overview instead of saved memories). For the
few question kinds where the right tool is unambiguous, the engine runs it
before the model's first call and attaches the result, so the answer never
depends on that choice. Memories are looked up on every turn (agent.py); this
module recognises the rest by their wording. A miss falls back to the model,
which still has every tool; a false match only attaches context the model is
told to use when it answers the question.
"""
from __future__ import annotations

import re

_FLAGS = re.IGNORECASE

# "What should I work on first?", "Which task matters most?", "How should I prioritize?", "What's next?"
PRIORITY_PATTERNS = [
    re.compile(r"\bprioriti[sz]", _FLAGS),
    re.compile(r"\b(most important|matters? (the )?most|top priorit\w*|highest priorit\w*|most urgent)\b", _FLAGS),
    re.compile(r"\bwhat (should|do|can|must) (i|we) (do|work on|tackle|start( with)?|focus on|pick( up)?|handle)\b", _FLAGS),
    re.compile(r"\b(work on|do|tackle|start( with)?|focus on|handle|pick( up)?) (first|next)\b", _FLAGS),
    re.compile(r"\bwhich (task|one|thing|item)s? (should|to|matters?|is|comes?|first|next)\b", _FLAGS),
    re.compile(r"\bwhat'?s next\b|\bwhat is next\b|\bwhere (should|do) (i|we) start\b", _FLAGS),
]

PRIORITY_TOOLS = {"lifestyle": "get_task_priorities", "work": "get_work_task_priorities"}


def asks_for_priorities(message: str) -> bool:
    return any(pattern.search(message) for pattern in PRIORITY_PATTERNS)
