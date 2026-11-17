"""The tools Michael may ask for, from `shared/ai/tool-declarations.json`.

The declarations (name, description, parameters) are the model-facing text and
live in one file both runtimes read. Which tools a request may use is decided
by the Next.js server after authorization; this module only refuses a name
outside the request's product, and checks the argument *shape* the same way the
server's strict Zod schemas do (an object, no unknown keys, required keys
present). Value rules stay with Zod, which runs again before any execution, so
this check is never stricter than the authority behind it.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.shared import load_shared_json

PRODUCTS = ("lifestyle", "work")


@dataclass(frozen=True)
class ToolDeclaration:
    name: str
    product: str
    description: str
    parameters: dict[str, Any]

    def for_model(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "parameters": self.parameters}


class CatalogError(Exception):
    pass


@lru_cache(maxsize=1)
def catalog() -> dict[str, ToolDeclaration]:
    data = load_shared_json("ai/tool-declarations.json")
    if data.get("schemaVersion") != 1:
        raise CatalogError("unsupported tool declaration schema")
    tools: dict[str, ToolDeclaration] = {}
    for entry in data["tools"]:
        parameters = entry["parameters"]
        if entry["product"] not in PRODUCTS or parameters.get("type") != "object" or parameters.get("additionalProperties") is not False:
            raise CatalogError(f"invalid declaration {entry.get('name')}")
        if entry["name"] in tools:
            raise CatalogError(f"duplicate declaration {entry['name']}")
        tools[entry["name"]] = ToolDeclaration(entry["name"], entry["product"], entry["description"], parameters)
    return tools


def tools_for(product: str, allowed: list[str]) -> list[ToolDeclaration]:
    """The declarations for this request, in the order the server listed them.

    A name from the other product, or one this service does not know, means the
    caller is wrong about the boundary; it is refused rather than dropped.
    """
    known = catalog()
    selected: list[ToolDeclaration] = []
    for name in allowed:
        declaration = known.get(name)
        if declaration is None or declaration.product != product:
            raise CatalogError(f"tool {name!r} is not available for {product}")
        if declaration not in selected:
            selected.append(declaration)
    return selected


def arguments_have_valid_shape(declaration: ToolDeclaration, arguments: Any) -> bool:
    if not isinstance(arguments, dict):
        return False
    properties = declaration.parameters.get("properties", {})
    if any(key not in properties for key in arguments):
        return False
    return all(key in arguments for key in declaration.parameters.get("required", []))
