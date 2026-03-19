import json
from pathlib import Path
from typing import Optional

GENERATED_DIR = Path("generated")


def cache_path(task_id: str) -> Path:
    return GENERATED_DIR / f"{task_id}_preview.json"


async def load_preview_content(task_id: str) -> Optional[dict]:
    path = cache_path(task_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


async def save_preview_content(task_id: str, data: dict) -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    cache_path(task_id).write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )
