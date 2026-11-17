"""The Python engine must agree with the TypeScript engine on every shared rule.

`shared/ai/parity-fixtures.json` is generated from the TypeScript code
(scripts/ai-parity-fixtures.ts) and kept fresh by a TypeScript test.
"""
from __future__ import annotations

import pytest

from app.guards.figure_containment import check_figure_containment
from app.guards.write_claims import DRAFT_LABELS, review_write_claims
from app.orchestration import instruction as inst
from app.orchestration.text import bounded_tool_result, safe_text
from app.shared import load_shared_json

FIXTURES = load_shared_json("ai/parity-fixtures.json")


def test_constants_match():
    constants = FIXTURES["constants"]
    assert inst.FRESH_DATA_NOTE == constants["FRESH_DATA_NOTE"]
    assert inst.GROUNDING_RETRY_NOTE == constants["GROUNDING_RETRY_NOTE"]
    assert inst.UNGROUNDED_REPLY == constants["UNGROUNDED_REPLY"]
    assert inst.LOOKUP_LIMIT == constants["LOOKUP_LIMIT"]
    assert inst.MAX_DRAFTS_PER_REPLY == constants["MAX_DRAFTS_PER_REPLY"]
    assert inst.RETRY_BUDGET_FRACTION == constants["RETRY_BUDGET_FRACTION"]
    assert DRAFT_LABELS == constants["draftLabels"]


@pytest.mark.parametrize("case", FIXTURES["instruction"], ids=lambda case: f"{case['context']['product']}-{case['today']}")
def test_instruction_matches(case):
    context = case["context"]
    assert inst.system_instruction(context["product"], case["today"], context.get("timeZone"), context.get("displayName")) == case["expected"]


@pytest.mark.parametrize("case", FIXTURES["writeClaims"], ids=lambda case: f"{case['message'][:30]}|{','.join(case['draftKinds'])}")
def test_write_claim_review_matches(case):
    review = review_write_claims(case["message"], case["draftKinds"])
    assert {"message": review.message, "corrected": review.corrected} == case["expected"]


@pytest.mark.parametrize("case", FIXTURES["figureContainment"], ids=lambda case: case["text"][:40])
def test_figure_containment_matches(case):
    allow = case.get("allowDiscourseNumbers", True)
    result = check_figure_containment(case["text"], case["toolResults"], allow_discourse_numbers=allow)
    assert {"contained": result.contained, "uncontained": result.uncontained} == case["expected"]


@pytest.mark.parametrize("case", FIXTURES["safeText"], ids=lambda case: f"{case['input'][:12]}-{case['maxLength']}")
def test_safe_text_matches(case):
    assert safe_text(case["input"], case["maxLength"]) == case["expected"]


@pytest.mark.parametrize("case", FIXTURES["boundedToolResult"], ids=["small", "large"])
def test_bounded_tool_result_matches(case):
    assert bounded_tool_result(case["input"]) == case["expected"]
