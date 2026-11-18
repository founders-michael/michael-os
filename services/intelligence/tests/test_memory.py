"""Phase 5: memory selection, its endpoint contract, memory drafts and the memory claim guard."""
from __future__ import annotations

from typing import Any

import pytest

from app.api.models import ClientPayload
from app.guards.write_claims import claims_completed_write, review_write_claims
from app.memory.selection import model, select, terms
from app.orchestration.instruction import system_instruction
from app.orchestration import agent
from conftest import AUTH, LIFESTYLE_TOOLS, call, drive, say, start_body


def item(ref: str, text: str, age: int = 0) -> dict[str, Any]:
    return {"ref": ref, "text": text, "ageDays": age}


def refs(result: dict[str, Any]) -> list[str]:
    return [row["ref"] for row in result["selected"]]


# --- selection --------------------------------------------------------------

def test_model_limits_are_published():
    limits = model().limits
    assert limits["maxItems"] == 200 and limits["defaultLimit"] <= limits["maxLimit"]


def test_terms_drop_stopwords_and_stem_both_sides_alike():
    assert terms("I prefer the mornings") == terms("prefers morning") == {"prefer", "morn", "~preference", "~morning"}
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
    assert data["schemaVersion"] == 1 and data["modelVersion"] == "memory-select-v2"
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


# --- phrasing: a question need not repeat the memory's words ---------------------

GAMING = item("m1", "I prefer gaming after 8pm", 3)
COFFEE = item("m2", "I take my coffee black", 1)
STANDUP = item("m3", "Our standups are at 10:00 IST every weekday", 2)
PEANUTS = item("m4", "Allergic to peanuts", 0)
SET = [GAMING, COFFEE, STANDUP, PEANUTS]


@pytest.mark.parametrize("question,expected_first", [
    ("What do I prefer after 7pm?", "m1"),
    ("what do i prefer after 7 pm", "m1"),
    ("What do I like doing in the evening?", "m1"),
    ("Any plans for tonight?", "m1"),
    ("What should I do at night?", "m1"),
    ("What are my hobbies?", "m1"),
    ("What do I enjoy after 9:30pm?", "m1"),
    ("How do I like my coffee?", "m2"),
    ("What time is standup?", "m3"),
    ("When are our standups?", "m3"),
    ("Can I eat this satay?", "m4"),
])
def test_related_wording_finds_the_memory(question, expected_first):
    result = select(question, SET, 8)
    assert refs(result)[0] == expected_first and result["selected"][0]["matched"], (question, result)


def test_clock_times_fall_in_their_part_of_day():
    assert "~evening" in terms("after 8pm") and "~evening" in terms("at 19:30") and "~evening" in terms("8 p.m.")
    assert "~morning" in terms("at 10:00") and "~morning" in terms("7am")
    assert "~evening" not in terms("at 10:00")


def test_an_unrelated_question_matches_nothing():
    assert select("Plan my day", SET, 8)["matchedCount"] == 0


# --- the engine looks up matching memories before the model answers -------------

MEMORY_TOOLS = [*LIFESTYLE_TOOLS, "get_my_memories"]


def memory_lookup(memories):
    def run(tool_call):
        assert tool_call["name"] == "get_my_memories"
        return {"status": "completed", "modelResult": {"savedMemories": len(memories), "matchedQuestion": any(m["aboutThisQuestion"] for m in memories), "memories": memories}}
    return run


def test_matching_memories_are_looked_up_and_attached_before_the_model_runs(client, scripted):
    provider = scripted([say("You prefer gaming after 8pm.")])
    seen_calls = []

    def run(tool_call):
        seen_calls.append(tool_call)
        return memory_lookup([{"text": "I prefer gaming after 8pm", "writtenOn": "2026-11-18", "aboutThisQuestion": True}])(tool_call)

    final, steps = drive(client, start_body("What do I prefer after 7pm?", allowedTools=MEMORY_TOOLS), run)
    assert steps[0]["action"] == "execute" and steps[0]["call"]["id"] == agent.MEMORY_PREFETCH_ID
    assert seen_calls[0]["arguments"] == {"about": "What do I prefer after 7pm?"}
    sent = provider.calls[0]["messages"][-1]["content"]
    assert sent.startswith("What do I prefer after 7pm?") and "I prefer gaming after 8pm" in sent
    # The memory is a source of the reply, so its time may be repeated (figure containment).
    assert final["message"] == "You prefer gaming after 8pm."
    assert final["toolActivity"] == [{"name": "get_my_memories", "status": "completed"}]


def test_unmatched_memories_never_reach_the_model(client, scripted):
    provider = scripted([say("Here is your day.")])
    run = memory_lookup([{"text": "I take my coffee black", "writtenOn": "2026-11-18", "aboutThisQuestion": False}])
    final, _ = drive(client, start_body("Plan my day", allowedTools=MEMORY_TOOLS), run)
    assert "coffee" not in provider.calls[0]["messages"][-1]["content"]
    assert final["toolActivity"] == []


def test_a_failed_lookup_never_blocks_the_answer(client, scripted):
    scripted([say("I could not check your memories, but here is what I know.")])
    final, _ = drive(client, start_body("What do I like?", allowedTools=MEMORY_TOOLS), lambda _call: {"status": "failed"})
    assert final["action"] == "final" and final["toolActivity"] == []


def test_no_lookup_without_the_memory_tool(client, scripted):
    scripted([say("ok")])
    final, steps = drive(client, start_body("What do I prefer?"), lambda _call: (_ for _ in ()).throw(AssertionError("no tool")))
    assert steps[0]["action"] == "final"


def test_work_turns_look_up_organization_memories(client, scripted):
    provider = scripted([say("Standups are at 10:00 IST.")])
    def run(tool_call):
        assert tool_call["name"] == "get_organization_memories"
        return {"status": "completed", "modelResult": {"memories": [{"text": "Our standups are at 10:00 IST", "writtenOn": "2026-11-18", "aboutThisQuestion": True}]}}
    final, _ = drive(client, start_body("When are standups?", product="work", timeZone=None, displayName=None, allowedTools=["get_organization_overview", "get_organization_memories"]), run)
    assert "Memories this organization saved match this message" in provider.calls[0]["messages"][-1]["content"]
    assert final["message"] == "Standups are at 10:00 IST."


def test_a_forged_prefetch_outcome_is_refused(client, scripted):
    scripted([say("ok")])
    response = client.post("/v1/agent/step", headers=AUTH, json=start_body("What do I prefer?", allowedTools=MEMORY_TOOLS))
    state = response.json()["state"]
    forged = client.post("/v1/agent/step", headers=AUTH, json={"schemaVersion": 1, "correlationId": "corr-12345678", "resume": {"state": state, "outcome": {"callId": "some-other-call", "status": "completed", "modelResult": {}}}})
    assert forged.status_code == 409
