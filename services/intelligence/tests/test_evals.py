"""Phase 6: the evaluation dataset is valid and every case is satisfiable through the real engine.

Scripted mode: the "model" calls each case's reference tools and gives its
reference answer. A case failing here means the case is wrong, or the engine
(prefetch, guards, figure containment) would reject a correct answer — both are
bugs. Live quality is measured by `npm run eval:live`, not here.
"""
from __future__ import annotations

import asyncio
import re

import pytest

from app.config import Limits, ProviderSettings
from evals.harness import ReferenceModel, check, load, memory_result, run_case, summarize

DATASET = load()
SETTINGS = ProviderSettings(provider="ollama", model="scripted", data_tier="paid", base_url="http://scripted")
LIMITS = Limits(max_tool_calls=5, max_iterations=4, timeout_ms=60_000, max_output_chars=6_000)


def test_the_dataset_loads_and_is_versioned():
    assert DATASET.version == "michael-v1" and len(DATASET.cases) >= 20
    assert {case.product for case in DATASET.cases} == {"lifestyle", "work"}


@pytest.mark.parametrize("case", DATASET.cases, ids=lambda case: case.id)
def test_the_reference_answer_passes_through_the_engine_unchanged(case):
    outcome = asyncio.run(run_case(case, ReferenceModel(case), SETTINGS, LIMITS))
    assert outcome.error is None, outcome.failures
    assert outcome.answer == case.reference, f"the engine rewrote a correct answer: {outcome.answer!r}"
    assert outcome.passed, outcome.failures


RECALL_CASES = [case for case in DATASET.cases
                if case.id.startswith(("memory.", "work.memory")) and case.id not in {"memory.not-saved", "memory.remember-request"}]


@pytest.mark.parametrize("case", RECALL_CASES, ids=lambda case: case.id)
def test_memory_cases_recall_through_ranking(case):
    # The memory the answer needs is attached by the prefetch, for every wording in the dataset.
    result = memory_result(case, case.message)
    matched = [m["text"] for m in result["memories"] if m["aboutThisQuestion"]]
    assert matched and any(re.search(pattern, " ".join(matched)) for pattern in case.expect.answerMatches), (case.id, result)


def test_check_reports_each_kind_of_failure():
    case = DATASET.cases[0]
    failures = check(case, "Your morning walk is done.", [], [])
    assert any("none of" in f for f in failures) and any("lacks" in f for f in failures) and any("forbidden" in f for f in failures)


def test_summary_counts_by_area():
    from evals.harness import Outcome
    summary = summarize([Outcome("memory.a", True, "", [], []), Outcome("memory.b", False, "", [], []), Outcome("work.c", True, "", [], [])])
    assert summary["passed"] == 2 and summary["byArea"] == {"memory": "1/2", "work": "1/1"}
