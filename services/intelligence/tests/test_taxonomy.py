"""The engine reads the same catalog the database is generated from, with the same product boundary."""
from __future__ import annotations

from app.taxonomy.registry import categories_for, registry


def test_registry_loads_every_category():
    categories = registry()
    assert len([c for c in categories.values() if c.parent is None]) == 67
    assert "personal.medical_health" in categories and "work.engineering" in categories


def test_personal_records_only_get_personal_categories():
    keys = {c.key for c in categories_for("lifestyle", "TASK")}
    assert keys and all(key.startswith("personal.") for key in keys)
    assert categories_for("lifestyle", "WORK_TASK") == []


def test_work_records_only_get_work_and_industry_categories():
    keys = {c.key for c in categories_for("work", "WORK_TASK")}
    assert keys and all(key.split(".")[0] in ("work", "industry") for key in keys)
    assert categories_for("work", "TASK") == []
    assert categories_for("teams", "TASK") == []


def test_sensitive_categories_never_enter_the_assistant_context():
    for product, entity in (("lifestyle", "TASK"), ("work", "PROJECT")):
        offered = categories_for(product, entity, purpose="ASSISTANT_CONTEXT")
        assert offered and all(c.sensitivity != "SENSITIVE" for c in offered)
    assert "personal.medical_health" not in {c.key for c in categories_for("lifestyle", "TASK", purpose="ASSISTANT_CONTEXT")}


def test_subdomains_accept_only_their_record_type():
    assert "personal.goals.goals" in {c.key for c in categories_for("lifestyle", "GOAL")}
    assert "personal.goals.goals" not in {c.key for c in categories_for("lifestyle", "TASK")}
