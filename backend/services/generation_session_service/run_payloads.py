from __future__ import annotations

import json


async def load_task_run_payload(*, db, task_id: str) -> dict | None:
    task_actions = getattr(db, "generationtask", None)
    if task_actions is None:
        return None

    find_unique = getattr(task_actions, "find_unique", None)
    find_first = getattr(task_actions, "find_first", None)

    if callable(find_unique):
        task = await find_unique(where={"id": task_id})
    elif callable(find_first):
        task = await find_first(where={"id": task_id})
    else:
        return None

    raw = getattr(task, "inputData", None) if task else None
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict) or not parsed.get("run_id"):
        return None
    return {
        "run_id": parsed.get("run_id"),
        "run_no": parsed.get("run_no"),
        "run_title": parsed.get("run_title"),
        "tool_type": parsed.get("tool_type"),
    }

