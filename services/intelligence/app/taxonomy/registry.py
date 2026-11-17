"""The taxonomy catalog, read from `shared/taxonomy/registry.json`.

The registry is validated by the Next.js test suite and applied to the database
by a migration generated from it; this module only reads it. When Michael
classifies a record (Phase 4) he may choose only from `categories_for` — never
invent a category — and his choice is stored as AI_INFERENCE, never as fact.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from app.shared import load_shared_json

PERSONAL_TYPES = frozenset({"TASK", "GOAL", "HABIT", "CALENDAR_EVENT"})
WORK_TYPES = frozenset({"WORK_TASK", "PROJECT"})
PRODUCT_NAMESPACES = {"lifestyle": ("personal",), "work": ("work", "industry")}


@dataclass(frozen=True)
class Category:
    key: str
    namespace: str
    parent: str | None
    name: str
    description: str
    sensitivity: str
    permitted_purposes: tuple[str, ...]
    entity_types: tuple[str, ...]
    active: bool


@lru_cache(maxsize=1)
def registry() -> dict[str, Category]:
    data = load_shared_json("taxonomy/registry.json")
    if data.get("schemaVersion") != 1:
        raise ValueError("unsupported taxonomy schema")
    return {
        entry["key"]: Category(
            key=entry["key"], namespace=entry["namespace"], parent=entry["parent"], name=entry["name"],
            description=entry["description"], sensitivity=entry["sensitivity"],
            permitted_purposes=tuple(entry["permittedPurposes"]), entity_types=tuple(entry["entityTypes"]),
            active=entry["status"] == "ACTIVE",
        )
        for entry in data["categories"]
    }


def categories_for(product: str, entity_type: str, purpose: str | None = None) -> list[Category]:
    """Active categories a record of this type may be placed in, optionally only those permitting `purpose`."""
    if product not in PRODUCT_NAMESPACES or entity_type not in (PERSONAL_TYPES if product == "lifestyle" else WORK_TYPES):
        return []
    return [
        category for category in registry().values()
        if category.active and category.namespace in PRODUCT_NAMESPACES[product] and entity_type in category.entity_types
        and (purpose is None or purpose in category.permitted_purposes)
    ]
