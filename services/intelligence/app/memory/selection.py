"""Which saved memories Michael reads for a question (Phase 5).

Deterministic: no model is called. The Next.js server has already narrowed the
candidates to one scope (one user's or one organization's memories) in SQL,
dropped expired ones and any whose sensitivity the active provider may not
receive. This module only orders what it was given, by word overlap with the
question. Terms are the words themselves, the related-word groups they belong
to ("like" and "prefer" share one, "tonight" and "evening" another) and the
part of day a clock time falls in ("8pm" and "7pm" are both evening), so a
question need not repeat the memory's exact words. Each shared term counts its
inverse document frequency, so a rare one ("dentist") outweighs a common one
("work"). Ties go to the newer memory,
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
# "8pm", "8 pm", "8:30pm", "08:30" (24-hour). Matched on the whole text before words are split.
_CLOCK_12 = re.compile(r"\b(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\b", re.IGNORECASE)
_CLOCK_24 = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
# Longest first. Crude ("running" → "runn"), but the question and the memories
# are stemmed the same way, which is all a match needs.
_SUFFIXES = ("ingly", "ings", "ing", "edly", "ed", "ies", "es", "ly", "s")


@dataclass(frozen=True)
class SelectionModel:
    version: str
    limits: dict[str, int]
    min_term_length: int
    stopwords: frozenset[str]
    # word (and its stem) -> the groups it belongs to; phrases are matched on the text.
    groups: dict[str, frozenset[str]]
    phrases: dict[str, frozenset[str]]
    day_parts: dict[str, tuple[int, int]]


@lru_cache(maxsize=1)
def model() -> SelectionModel:
    data = load_shared_json("intelligence/memory-selection.json")
    if data.get("schemaVersion") != 1:
        raise ValueError("unsupported memory selection schema")
    groups: dict[str, set[str]] = {}
    phrases: dict[str, set[str]] = {}
    for name, members in data["conceptGroups"].items():
        for member in members:
            word = member.casefold()
            if " " in word:
                phrases.setdefault(word, set()).add(name)
                continue
            for key in {word, _stem(word)}:
                groups.setdefault(key, set()).add(name)
    return SelectionModel(
        version=data["modelVersion"],
        limits={key: int(value) for key, value in data["limits"].items()},
        min_term_length=int(data["minTermLength"]),
        stopwords=frozenset(word.lower() for word in data["stopwords"]),
        groups={key: frozenset(value) for key, value in groups.items()},
        phrases={key: frozenset(value) for key, value in phrases.items()},
        day_parts={name: (int(bounds[0]), int(bounds[1])) for name, bounds in data["dayParts"].items()},
    )


def _stem(word: str) -> str:
    for suffix in _SUFFIXES:
        # Keep at least three characters of stem, so "yes" never becomes "y".
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def _concept(name: str) -> str:
    # Cannot collide with a word: words never contain "~".
    return f"~{name}"


def _day_part(hour: int, current: SelectionModel) -> str | None:
    for name, (first, last) in current.day_parts.items():
        if first <= hour <= last:
            return name
    return None


def _clock_terms(text: str, current: SelectionModel) -> set[str]:
    found: set[str] = set()
    hours: list[int] = []
    for match in _CLOCK_12.finditer(text):
        hour = int(match.group(1))
        if 1 <= hour <= 12:
            hours.append(hour % 12 + (12 if match.group(3).lower() == "p" else 0))
    hours += [int(match.group(1)) for match in _CLOCK_24.finditer(text)]
    for hour in hours:
        part = _day_part(hour, current)
        if part:
            found.add(_concept(part))
        found.add(_concept(f"hour{hour}"))
    return found


def terms(text: str) -> set[str]:
    """Comparable terms of a text: its words (lower-cased, stop words dropped, lightly
    stemmed), the related-word groups they belong to, and the part of day of any clock time."""
    current = model()
    folded = text.casefold()
    found: set[str] = _clock_terms(folded, current)
    for phrase, names in current.phrases.items():
        if phrase in folded:
            found.update(_concept(name) for name in names)
    for raw in _WORD.findall(folded):
        stem = _stem(raw)
        # Group membership counts even for a stop word: "like" is a preference.
        for key in (raw, stem):
            found.update(_concept(name) for name in current.groups.get(key, ()))
        if len(raw) < current.min_term_length or raw in current.stopwords:
            continue
        found.add(stem)
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
