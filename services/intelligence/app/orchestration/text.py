"""String helpers that behave exactly like their JavaScript counterparts.

The two engines must produce the same bytes during the migration, so length
limits count UTF-16 code units (as JavaScript's `.length` and `.slice` do), not
Python code points, and JSON is compact like `JSON.stringify`.
"""
from __future__ import annotations

import json
import re
from typing import Any

# JavaScript's String.prototype.trim whitespace set (WhiteSpace + LineTerminator).
JS_WHITESPACE = "\t\n\u000b\u000c\r    -     　﻿"
_TRIM = re.compile(f"^[{JS_WHITESPACE}]+|[{JS_WHITESPACE}]+$")
_CONTROL = re.compile("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]")


def js_trim(value: str) -> str:
    return _TRIM.sub("", value)


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le", "surrogatepass")) // 2


def utf16_slice(value: str, end: int) -> str:
    """`value.slice(0, end)` in JavaScript, which may split a surrogate pair."""
    return value.encode("utf-16-le", "surrogatepass")[: end * 2].decode("utf-16-le", "surrogatepass")


def js_json(value: Any) -> str:
    """`JSON.stringify(value)` for JSON-shaped data."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def safe_text(value: str, max_length: int) -> str:
    return utf16_slice(js_trim(_CONTROL.sub("", value)), max_length)


TOOL_RESULT_MAX = 8_000
TOOL_RESULT_TRUNCATED = 7_900


def bounded_tool_result(value: Any) -> Any:
    try:
        text = js_json(value)
    except (TypeError, ValueError):
        text = "null"
    if utf16_length(text) <= TOOL_RESULT_MAX:
        return value
    return {"truncated": True, "text": utf16_slice(text, TOOL_RESULT_TRUNCATED)}
