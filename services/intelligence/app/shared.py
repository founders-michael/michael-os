"""Files shared with the Next.js app, in the repository's `shared/` directory."""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


def shared_dir() -> Path:
    override = os.environ.get("MICHAELOS_SHARED_DIR")
    return Path(override) if override else Path(__file__).resolve().parents[3] / "shared"


@lru_cache(maxsize=8)
def load_shared_json(relative: str) -> Any:
    with (shared_dir() / relative).open(encoding="utf-8") as handle:
        return json.load(handle)
