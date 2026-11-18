"""Phase 5: memory selection, its endpoint contract, memory drafts and the memory claim guard."""
from __future__ import annotations

from typing import Any

import pytest

from app.api.models import ClientPayload
from app.guards.write_claims import claims_completed_write, review_write_claims
from app.memory.selection import model, select, terms
from app.orchestration.instruction import system_instruction
from conftest import AUTH


def item(ref: str, text: str, age: int = 0) -> dict[str, Any]:
    return {"ref": ref, "text": text, "ageDays": age}


def refs(result: dict[str, Any]) -> list[str]:
    return [row["ref"] for row in result["selected"]]


# --- selection --------------------------------------------------------------

def test_model_limits_are_published():
    limits = model().limits
    assert limits["maxItems"] == 200 and limits["defaultLimit"] <= limits["maxLimit"]


def test_terms_drop_stopwords_and_stem_both_sides_alike():
    assert terms("I prefer the mornings") == terms("prefers morning") == {"prefer", "morn"}
    assert "the" not in terms("the gym") and "gym" in terms("the gym")
    assert terms("Workouts") == terms("workout")


def test_relevant_memory_ranks_first_and_rare_words_outweigh_common_ones():
    items = [
        item("m1", "I work from home on Fridays"),
        item("m2", "My dentist is Dr Rao, appointments only on work days"),
        item("m3", "I prefer deep work before lunch"),
    ]
    result = select("When should I book the dentist?", items, 8)
    assert result["queried"] and refs(result)[0] == "m2"
    assert all(row["matched"] for row in result["selected"])


def test_ties_go_to_the_newer_memory_then_input_order():
    items = [item("m1", "gym on mondays", 30), item("m2", "gym on tuesdays", 2), item("m3", "gym on sundays", 2)]
    assert refs(select("gym", items, 8)) == ["m2", "m3", "m1"]


def test_no_question_or_no_overlap_returns_the_newest_unmatched():
    items = [item("m1", "old preference", 40), item("m2", "new preference", 1)]
    for query in (None, "", "quantum chromodynamics"):
        result = select(query, items, 8)
        assert refs(result) == ["m2", "m1"]
        assert result["matchedCount"] == 0 and not any(row["matched"] for row in result["selected"])


def test_limit_bounds_the_selection():
    items = [item(f"m{i}", f"coffee note {i}", i) for i in range(20)]
    assert len(select("coffee", items, 3)["selected"]) == 3


def test_empty_candidate_set_selects_nothing():
    assert select("anything", [], 8)["selected"] == []


# --- endpoint ---------------------------------------------------------------

def body(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {"schemaVersion": 1, "product": "lifestyle", "query": "dentist",
                               "items": [item("m1", "Dentist is Dr Rao"), item("m2", "Likes tea", 3)]}
    payload.update(overrides)
    return payload


def test_select_endpoint_requires_the_service_token(client, monkeypatch):
    assert client.post("/v1/memory/select", json=body()).status_code == 401
    assert client.post("/v1/memory/select", headers={"Authorization": "Bearer wrong-token-with-more-than-32-chars!!"}, json=body()).status_code == 401
    monkeypatch.setenv("INTELLIGENCE_SERVICE_TOKEN", "")
    assert client.post("/v1/memory/select", headers=AUTH, json=body()).status_code == 503


def test_select_endpoint_ranks(client):
    response = client.post("/v1/memory/select", headers=AUTH, json=body())
    assert response.status_code == 200
    data = response.json()
    assert data["schemaVersion"] == 1 and data["modelVersion"] == "memory-select-v1"
    assert [row["ref"] for row in data["selected"]][0] == "m1"


@pytest.mark.parametrize("mutate", [
    lambda b: b.update(userId="user-1"),
    lambda b: b.update(organizationId="org-1"),
    lambda b: b["items"][0].update(id="mem-1"),
    lambda b: b["items"][0].update(ref="cmabc123"),
    lambda b: b["items"].append(item("m1", "duplicate ref")),
    lambda b: b["items"][0].update(text="x" * 281),
    lambda b: b.update(query="q" * 201),
    lambda b: b.update(limit=11),
    lambda b: b.update(product="health"),
    lambda b: b.update(items=[item(f"m{i}", "note") for i in range(201)]),
])
def test_select_contract_refuses_identity_and_unbounded_input(client, mutate):
    payload = body()
    mutate(payload)
    response = client.post("/v1/memory/select", headers=AUTH, json=payload)
    assert response.status_code == 422
    assert "org-1" not in response.text and "user-1" not in response.text


# --- drafts, guard, instruction ---------------------------------------------

@pytest.mark.parametrize("kind", ["memory", "organizationMemory"])
def test_memory_drafts_are_client_payloads(kind):
    payload = ClientPayload(kind="draft", draftKind=kind, draft={"values": {"content": "Prefers mornings"}})
    assert payload.draftKind == kind


@pytest.mark.parametrize("message", [
    "Got it, I'll remember that you prefer mornings.",
    "I will remember this.",
    "I've noted that you like tea.",
    "I have stored it.",
    "I've made a note of your preference.",
    "I saved it to my memory.",
    "I'll keep that in mind for next time.",
])
def test_memory_claims_are_caught(message):
    assert claims_completed_write(message)


@pytest.mark.parametrize("message", [
    "As you noted earlier, the report is due Friday.",
    "Your memories say you prefer mornings.",
    "Do you want me to draft a memory for that?",
    "I can't remember anything myself.",
])
def test_ordinary_sentences_pass(message):
    assert not claims_completed_write(message)


def test_memory_claim_is_replaced_with_the_draft_correction():
    review = review_write_claims("Sure. I'll remember that you prefer tea.", ["memory"])
    assert review.corrected
    assert "I'll remember" not in review.message
    assert "memory below" in review.message and "press Save" in review.message
    assert not claims_completed_write(review.message)


def test_instruction_names_the_memory_tools_per_product():
    personal = system_instruction("lifestyle", "2026-11-18", "Asia/Kolkata", None)
    work = system_instruction("work", "2026-11-18")
    assert "get_my_memories" in personal and "draft_memory" in personal
    assert "get_organization_memories" not in personal
    assert "get_organization_memories" in work and "draft_organization_memory" in work
    assert "get_my_memories" not in work
