import json
import logging
from pathlib import Path
from typing import Optional

from services.runtime_paths import get_generated_dir

GENERATED_DIR = get_generated_dir()
logger = logging.getLogger(__name__)


def cache_path(task_id: str) -> Path:
    return GENERATED_DIR / f"{task_id}_preview.json"


async def load_preview_content(task_id: str) -> Optional[dict]:
    cached = await _load_preview_content_from_db(task_id)
    if isinstance(cached, dict):
        return cached

    path = cache_path(task_id)
    if not path.exists():
        return None
    try:
        legacy_content = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if isinstance(legacy_content, dict):
        try:
            await _save_preview_content_to_db(task_id, legacy_content)
        except Exception:
            logger.warning(
                "preview_cache_legacy_migration_failed key=%s",
                task_id,
                exc_info=True,
            )
        return legacy_content
    return None


async def save_preview_content(task_id: str, data: dict) -> None:
    await _save_preview_content_to_db(task_id, data)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    cache_path(task_id).write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )


def _preview_cache_db():
    from services.database import db_service

    return getattr(db_service, "db", None)


async def _load_preview_content_from_db(task_id: str) -> Optional[dict]:
    db = _preview_cache_db()
    if db is None or not hasattr(db, "query_raw"):
        return None
    try:
        rows = await db.query_raw(
            'SELECT "content" FROM "PreviewCache" WHERE "key" = $1 LIMIT 1',
            str(task_id),
        )
    except Exception:
        logger.warning(
            "preview_cache_db_load_failed key=%s",
            task_id,
            exc_info=True,
        )
        return None
    if not isinstance(rows, list) or not rows:
        return None
    raw_content = rows[0].get("content") if isinstance(rows[0], dict) else None
    if not isinstance(raw_content, str) or not raw_content.strip():
        return None
    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError:
        logger.warning("preview_cache_db_payload_invalid key=%s", task_id)
        return None
    return parsed if isinstance(parsed, dict) else None


async def _save_preview_content_to_db(task_id: str, data: dict) -> None:
    db = _preview_cache_db()
    if db is None or not hasattr(db, "execute_raw"):
        raise RuntimeError("PreviewCache DB client is unavailable")
    payload = json.dumps(data, ensure_ascii=False)
    await db.execute_raw(
        (
            'INSERT INTO "PreviewCache" ("key", "content") VALUES ($1, $2) '
            'ON CONFLICT ("key") DO UPDATE SET '
            '"content" = EXCLUDED."content", "updatedAt" = CURRENT_TIMESTAMP'
        ),
        str(task_id),
        payload,
    )
