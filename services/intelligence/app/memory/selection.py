"""Which saved memories Michael reads for a question (Phase 5).

Deterministic: no model is called. The Next.js server has already narrowed the
candidates to one scope (one user's or one organization's memories) in SQL,
dropped expired ones and any whose sensitivity the active provider may not
receive. This module only orders what it was given, by word overlap with the
question: each shared term counts its inverse document frequency, so a rare
word ("dentist") outweighs a common one ("work"). Ties go to the newer memory,
then to input order. With no question, or no overlap, the newest are returned
and marked unmatched, so Michael can say none was about the question.

Items carry a request-local `ref` and their text only: no id, no owner.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.shared import load_shared_json

_WORD = re.compile(r"[^\W_]+", re.UNICODE)
# Longest first. Crude ("running" → "runn"), but the question and the memories
# are stemmed the same way, which is all a match needs.
_SUFFIXES = ("ingly", "ings", "ing", "edly", "ed", "ies", "es", "ly", "s")


@dataclass(frozen=True)
class SelectionModel:
    version: str
    limits: dict[str, int]
    min_term_length: int
    stopwords: frozenset[str]


@lru_cache(maxsize=1)
def model() -> SelectionModel:
    data = load_shared_json("intelligence/memory-selection.json")
    if data.get("schemaVersion") != 1:
        raise ValueError("unsupported memory selection schema")
    return SelectionModel(
        version=data["modelVersion"],
        limits={key: int(value) for key, value in data["limits"].items()},
        min_term_length=int(data["minTermLength"]),
        stopwords=frozenset(word.lower() for word in data["stopwords"]),
    )


def _stem(word: str) -> str:
    for suffix in _SUFFIXES:
        # Keep at least three characters of stem, so "yes" never becomes "y".
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def terms(text: str) -> set[str]:
    """The distinct comparable words of a text: lower-cased, stop words dropped, lightly stemmed."""
    current = model()
    found: set[str] = set()
    for raw in _WORD.findall(text.casefold()):
        if len(raw) < current.min_term_length or raw in current.stopwords:
            continue
        found.add(_stem(raw))
    return found


def select(query: str | None, items: list[dict[str, Any]], limit: int) -> dict[str, Any]:
    """Order `items` ({ref, text, ageDays}) for `query`; return at most `limit` refs."""
    current = model()
    item_terms = [terms(item["text"]) for item in items]
    query_terms = terms(query) if query else set()

    count = len(items)
    document_frequency: dict[str, int] = {}
    for found in item_terms:
        for term in found & query_terms:
            document_frequency[term] = document_frequency.get(term, 0) + 1

    scored = []
    for index, (item, found) in enumerate(zip(items, item_terms)):
        shared = found & query_terms
        # Smoothed IDF, always positive: a term in every memory still counts a little.
        score = sum(math.log(1 + count / document_frequency[term]) for term in shared)
        scored.append((score, item["ageDays"], index, item["ref"]))

    matched = sorted((row for row in scored if row[0] > 0), key=lambda row: (-row[0], row[1], row[2]))
    if matched:
        selected = [{"ref": ref, "matched": True, "score": round(score, 4)} for score, _, _, ref in matched[:limit]]
    else:
        newest = sorted(scored, key=lambda row: (row[1], row[2]))
        selected = [{"ref": ref, "matched": False, "score": 0.0} for _, _, _, ref in newest[:limit]]
    return {
        "modelVersion": current.version,
        "queried": bool(query_terms),
        "matchedCount": len(matched),
        "selected": selected,
    }
