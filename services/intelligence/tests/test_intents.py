"""The engine runs the ranking itself for questions that ask what to do first (intents.py, agent prefetch)."""
from __future__ import annotations

import pytest

from app.orchestration import agent
from app.orchestration.intents import asks_for_priorities
from conftest import LIFESTYLE_TOOLS, drive, say, start_body


@pytest.mark.parametrize("message", [
    "What should I work on first?", "what should i do first", "Which task matters most right now?", "What's next?",
    "How should I prioritize today?", "Help me prioritise my tasks", "What is most important today?", "Where should I start?",
    "What should I focus on?", "Which one should I do next?", "What's my top priority?", "What can I tackle first?",
])
def test_priority_questions_are_recognised(message):
    assert asks_for_priorities(message)


@pytest.mark.parametrize("message", [
    "When do invoices go out on the first?", "What do I prefer after 7pm?", "What's on today?", "Add a task to call mum",
    "How do I take my coffee?", "Show my goals", "What did I complete yesterday?",
])
def test_other_questions_are_not(message):
    assert not asks_for_priorities(message)


RANKING = {"asOfDate": "2026-11-18", "tasks": [{"rank": 1, "title": "Submit the tax form", "why": "Overdue by 2 days"}]}
TOOLS = [*LIFESTYLE_TOOLS, "get_my_memories", "get_task_priorities"]


def test_a_priority_question_gets_the_ranking_before_the_model_runs(client, scripted):
    provider = scripted([say("Start with Submit the tax form: it is overdue by 2 days.")])
    calls = []

    def run(call):
        calls.append(call["name"])
        if call["name"] == "get_my_memories":
            return {"status": "completed", "modelResult": {"memories": []}}
        return {"status": "completed", "modelResult": RANKING}

    final, _ = drive(client, start_body("What should I work on first?", allowedTools=TOOLS), run)
    assert calls == ["get_my_memories", "get_task_priorities"]
    sent = provider.calls[0]["messages"][-1]["content"]
    assert "get_task_priorities was already run" in sent and "Submit the tax form" in sent
    # The ranking is a source, so its figures may be repeated.
    assert final["message"] == "Start with Submit the tax form: it is overdue by 2 days."
    assert {"name": "get_task_priorities", "status": "completed"} in final["toolActivity"]


def test_other_questions_do_not_run_the_ranking(client, scripted):
    scripted([say("ok")])
    calls = []
    drive(client, start_body("What's on today?", allowedTools=TOOLS), lambda call: calls.append(call["name"]) or {"status": "completed", "modelResult": {"memories": []}})
    assert calls == ["get_my_memories"]


def test_a_failed_ranking_never_blocks_the_answer(client, scripted):
    scripted([say("I could not load the ranking right now.")])
    final, _ = drive(client, start_body("What should I do first?", allowedTools=TOOLS), lambda call: {"status": "failed"})
    assert final["action"] == "final"


def test_work_uses_the_work_ranking(client, scripted):
    scripted([say("ok")])
    calls = []
    drive(client, start_body("Which task matters most?", product="work", timeZone=None, displayName=None,
                             allowedTools=["get_organization_overview", "get_organization_memories", "get_work_task_priorities"]),
          lambda call: calls.append(call["name"]) or {"status": "completed", "modelResult": {"memories": [], "tasks": []}})
    assert calls == ["get_organization_memories", "get_work_task_priorities"]
    assert agent.PRIORITY_PREFETCH_ID == "priority-prefetch"
