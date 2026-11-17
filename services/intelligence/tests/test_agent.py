"""The turn rules, mirroring src/lib/ai/ai.test.ts against the Python engine."""
from __future__ import annotations

import pytest

from app.orchestration import agent
from app.orchestration.instruction import FRESH_DATA_NOTE, GROUNDING_RETRY_NOTE, LOOKUP_LIMIT, UNGROUNDED_REPLY, UNGROUNDED_REPLY_WORK
from app.providers.base import ProviderError
from conftest import AUTH, call, drive, say, start_body

INVENTED_ROUTINE = "Your routine: wake at 6:45 AM, work 9:15 AM – 5:40 PM. Your goal is at 64%."


class FakeClock:
    def __init__(self, start: float = 1_800_000_000.0):
        self.now = start

    def time(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch):
    fake = FakeClock()
    monkeypatch.setattr(agent, "time", fake)
    return fake


def completed(result=None, payload=None):
    outcome = {"status": "completed", "modelResult": result if result is not None else {"ok": True}}
    if payload is not None:
        outcome["clientPayload"] = payload
    return outcome


def never_runs(_call):
    raise AssertionError("no tool should run")


def test_a_plain_answer_needs_no_tool(client, scripted):
    provider = scripted([say("Hello Asha.")])
    final, steps = drive(client, start_body("Hi"), never_runs)
    assert final["message"] == "Hello Asha." and final["toolActivity"] == [] and len(steps) == 1
    # The reminder to read fresh data goes to the model only, on the latest user message.
    assert provider.calls[0]["messages"][-1]["content"] == f"Hi\n\n{FRESH_DATA_NOTE}"
    assert "Asha" in provider.calls[0]["system_instruction"]


def test_only_the_requested_products_tools_reach_the_model(client, scripted):
    provider = scripted([say("ok")])
    drive(client, start_body(allowedTools=["get_my_tasks", "draft_task"]), never_runs)
    assert [tool["name"] for tool in provider.calls[0]["tools"]] == ["get_my_tasks", "draft_task"]
    assert set(provider.calls[0]["tools"][0]) == {"name", "description", "parameters"}


def test_work_instruction_has_no_personal_rules(client, scripted):
    provider = scripted([say("ok")])
    drive(client, start_body(product="work", timeZone=None, displayName=None, allowedTools=["get_organization_overview"]), never_runs)
    instruction = provider.calls[0]["system_instruction"]
    assert "WorkOS" in instruction and "Do not access or infer LifestyleOS personal data" in instruction
    assert "My Context" not in instruction and "(UTC date)" in instruction


def test_arguments_with_unknown_fields_never_reach_the_server(client, scripted):
    scripted([call(("get_my_tasks", {"userId": "victim", "organizationId": "attacker"})), say("Sorry.")])
    final, _ = drive(client, start_body(), never_runs)
    assert final["toolActivity"] == [{"name": "get_my_tasks", "status": "failed"}]


def test_missing_required_arguments_are_refused(client, scripted):
    scripted([call(("prepare_schedule_proposal", {"fromDate": "2026-11-17"})), say("Which dates?")])
    final, _ = drive(client, start_body(), never_runs)
    assert final["toolActivity"] == [{"name": "prepare_schedule_proposal", "status": "failed"}]


def test_unknown_or_unpermitted_tools_do_not_execute(client, scripted):
    scripted([call(("delete_everything", {}), ("get_organization_members", {})), say("I can't do that.")])
    final, _ = drive(client, start_body(), never_runs)
    assert final["toolActivity"] == [{"name": "delete_everything", "status": "unavailable"}, {"name": "get_organization_members", "status": "unavailable"}]


def test_the_server_refusing_arguments_is_reported_as_failed(client, scripted):
    provider = scripted([call(("get_my_calendar", {"fromDate": "not-a-date"})), say("That date is not valid.")])
    final, _ = drive(client, start_body(), lambda c: {"status": "invalid_arguments"})
    assert final["toolActivity"] == [{"name": "get_my_calendar", "status": "failed"}]
    sent = provider.calls[1]["results"][0]
    assert sent.result == {"error": "Tool arguments were invalid."} and sent.is_error


def test_a_failing_tool_tells_the_model_only_that_it_is_unavailable(client, scripted):
    provider = scripted([call(("get_my_goals", {})), say("Your goals are unavailable right now.")])
    final, _ = drive(client, start_body(), lambda c: {"status": "failed"})
    assert final["toolActivity"] == [{"name": "get_my_goals", "status": "failed"}]
    assert provider.calls[1]["results"][0].result == {"error": "This information is currently unavailable."}


def test_tool_call_limit_stops_before_running_anything(client, scripted, monkeypatch):
    monkeypatch.setenv("AI_MAX_TOOL_CALLS", "1")
    scripted([call(("get_my_tasks", {}), ("get_my_goals", {}))])
    final, _ = drive(client, start_body(), never_runs)
    assert final["message"] == LOOKUP_LIMIT and final["payloadAttempt"] == 1


def test_iteration_limit_stops_a_model_that_keeps_asking(client, scripted, monkeypatch):
    monkeypatch.setenv("AI_MAX_ITERATIONS", "1")
    scripted([call(("get_my_tasks", {})), call(("get_my_goals", {}))])
    final, _ = drive(client, start_body(), lambda c: completed())
    assert final["message"] == LOOKUP_LIMIT
    assert final["toolActivity"] == [{"name": "get_my_tasks", "status": "completed"}]


def test_only_one_schedule_proposal_per_reply(client, scripted):
    args = {"fromDate": "2026-11-17", "toDate": "2026-11-18"}
    scripted([call(("prepare_schedule_proposal", args), ("prepare_schedule_proposal", args)), say("Here is a draft schedule.")])
    ran = []
    final, _ = drive(client, start_body(), lambda c: ran.append(c) or completed({"sessions": []}, {"kind": "planningProposal"}))
    assert len(ran) == 1
    assert final["toolActivity"] == [{"name": "prepare_schedule_proposal", "status": "completed"}, {"name": "prepare_schedule_proposal", "status": "failed"}]


def test_at_most_three_drafts_per_reply(client, scripted):
    four = [("draft_task", {"title": f"Task {i}"}) for i in range(4)]
    scripted([call(*four), say("Here are your drafts.")])
    ran = []
    final, _ = drive(client, start_body(), lambda c: ran.append(c) or completed({"saved": False}, {"kind": "draft", "draftKind": "task", "draft": {"title": c["arguments"]["title"]}}))
    assert len(ran) == 3
    assert [a["status"] for a in final["toolActivity"]] == ["completed", "completed", "completed", "failed"]


def test_planning_payload_details_never_reach_the_model(client, scripted):
    provider = scripted([call(("prepare_schedule_proposal", {"fromDate": "2026-11-17", "toDate": "2026-11-17"})), say("I prepared a draft for review.")])
    final, _ = drive(client, start_body(), lambda c: completed({"sessions": [{"task": "Write report"}]}, {"kind": "planningProposal"}))
    assert final["payloadAttempt"] == 1
    assert "approval" not in str(provider.calls[1]["results"]).lower()


def test_a_false_save_claim_is_replaced(client, scripted):
    scripted([call(("draft_task", {"title": "Buy milk"})), say("I've added the task to your list.")])
    final, _ = drive(client, start_body("Add buy milk"), lambda c: completed({"saved": False}, {"kind": "draft", "draftKind": "task", "draft": {"title": "Buy milk"}}))
    assert final["message"] == "I have prepared the task below. Review the details and press Save to add it; until you do, it exists only in this chat."


def test_draft_values_may_be_repeated_back(client, scripted):
    scripted([call(("draft_task", {"title": "Run", "estimatedDurationMinutes": 45})), say("The draft is below: Run, 45 minutes. Press Save.")])
    final, _ = drive(client, start_body("Add a run"), lambda c: completed({"saved": False}, {"kind": "draft", "draftKind": "task", "draft": {"title": "Run", "estimatedDurationMinutes": 45}}))
    assert final["message"].startswith("The draft is below")


def test_an_ungrounded_reply_is_retried_then_accepted_once_grounded(client, scripted):
    provider = scripted([say(INVENTED_ROUTINE), call(("get_daily_overview", {})), say("Work hours 10:00 AM – 6:00 PM. Your goal is at 30%.")])
    final, _ = drive(client, start_body("What is my routine?"), lambda c: completed({"routine": {"workHours": "10:00 AM – 6:00 PM"}, "goals": [{"progressPercent": 30}]}))
    assert final["message"] == "Work hours 10:00 AM – 6:00 PM. Your goal is at 30%."
    assert provider.calls[1]["messages"][-1]["content"].endswith(GROUNDING_RETRY_NOTE)
    assert final["toolActivity"] == [{"name": "get_daily_overview", "status": "completed"}]
    assert final["payloadAttempt"] == 2


def test_a_reply_that_stays_ungrounded_is_withheld(client, scripted):
    scripted([say(INVENTED_ROUTINE), say(INVENTED_ROUTINE)])
    final, _ = drive(client, start_body(), never_runs)
    assert final["message"] == UNGROUNDED_REPLY and final["payloadAttempt"] is None


def test_figures_the_user_stated_may_be_repeated(client, scripted):
    scripted([say("A habit to sleep by 1 AM and wake at 8 AM sounds good.")])
    final, _ = drive(client, start_body("I want to sleep by 1 am and wake up at 8am"), never_runs)
    assert final["message"] == "A habit to sleep by 1 AM and wake at 8 AM sounds good."


def test_michaels_earlier_replies_are_not_a_source_for_figures(client, scripted):
    scripted([say("Your goal is at 75%."), say("Your goal is at 75%.")])
    messages = [{"role": "user", "content": "What is my goal?"}, {"role": "assistant", "content": "Your goal is at 75%."}, {"role": "user", "content": "Say it again"}]
    final, _ = drive(client, start_body(messages=messages), never_runs)
    assert final["message"] == UNGROUNDED_REPLY


def test_without_time_to_retry_an_ungrounded_reply_is_withheld_at_once(client, scripted, clock):
    def slow(**_):
        clock.now += 20  # 20 of the 30 seconds spent
        return say(INVENTED_ROUTINE)
    provider = scripted([slow])
    final, _ = drive(client, start_body(), never_runs)
    assert final["message"] == UNGROUNDED_REPLY and len(provider.calls) == 1


def test_the_deadline_also_bounds_a_slow_tool(client, scripted, clock):
    scripted([call(("get_my_tasks", {})), say("unused")])
    def slow_tool(_call):
        clock.now += 31
        return completed()
    final, _ = drive(client, start_body(), slow_tool)
    assert final == {"action": "error", "kind": "agent", "code": "REQUEST_TIMEOUT"}


def test_provider_failures_surface_by_code(client, scripted):
    for code in ["RATE_LIMITED", "TIMEOUT", "UNAVAILABLE", "ACCESS_DENIED", "INVALID_RESPONSE", "MODEL_NOT_FOUND"]:
        scripted([ProviderError(code)])
        final, _ = drive(client, start_body(), never_runs)
        assert final == {"action": "error", "kind": "provider", "code": code}


def test_an_empty_answer_is_an_invalid_model_response(client, scripted):
    scripted([say("   \u0000  ")])
    final, _ = drive(client, start_body(), never_runs)
    assert final == {"action": "error", "kind": "agent", "code": "INVALID_MODEL_RESPONSE"}


def test_output_is_cleaned_and_bounded(client, scripted, monkeypatch):
    monkeypatch.setenv("AI_MAX_OUTPUT_CHARS", "500")
    scripted([say("  ok\u0007 " + "word " * 300)])
    final, _ = drive(client, start_body(), never_runs)
    assert len(final["message"]) == 500 and "\u0007" not in final["message"] and final["message"].startswith("ok ")


def test_large_tool_results_are_truncated_before_the_model_sees_them(client, scripted):
    provider = scripted([call(("get_my_tasks", {})), say("Here is a summary.")])
    drive(client, start_body(), lambda c: completed({"tasks": [{"title": "x" * 100}] * 200}))
    sent = provider.calls[1]["results"][0].result
    assert sent["truncated"] is True and len(sent["text"]) == 7_900


def test_tokens_are_not_logged(client, scripted, caplog):
    scripted([say(INVENTED_ROUTINE), say(INVENTED_ROUTINE)])
    drive(client, start_body("my secret message"), never_runs)
    assert "secret" not in caplog.text and AUTH["Authorization"] not in caplog.text


def test_a_withheld_work_reply_names_only_organization_data(client, scripted):
    # WorkOS has no habits or calendar; the withheld text must not promise to read them.
    scripted([say("Risk is at 80%."), say("Risk is at 80%.")])
    final, _ = drive(client, start_body("How risky is the launch?", product="work", allowedTools=["get_organization_overview"], timeZone=None, displayName=None), never_runs)
    assert final["message"] == UNGROUNDED_REPLY_WORK
    assert "habits" not in final["message"] and "calendar" not in final["message"]
